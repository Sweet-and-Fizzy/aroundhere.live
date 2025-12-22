/**
 * Artist Profile Service
 *
 * Builds rich artist profiles by combining data from multiple sources:
 * - Our genre taxonomy
 * - Spotify genres
 * - MusicBrainz tags and descriptions
 *
 * Generates embeddings for:
 * - Individual artist profiles
 * - User taste profiles (averaged from favorite artists)
 *
 * Note: Spotify audio features were deprecated in Nov 2024.
 */

import { prisma } from '../../utils/prisma'
import { generateEmbedding } from '../embeddings'

// Weights for blending user taste profile
const ARTIST_EMBEDDING_WEIGHT = 0.7
const INTEREST_EMBEDDING_WEIGHT = 0.3

export interface ArtistProfileData {
  id: string
  name: string
  ourGenres: string[]
  spotifyGenres: string[]
  musicbrainzTags: string[]
  description: string | null
}

/**
 * Build the text content to embed for an artist profile
 * Combines all available sources into a rich textual representation
 */
export function buildArtistProfileText(artist: ArtistProfileData): string {
  const parts: string[] = []

  // Artist name
  parts.push(`Artist: ${artist.name}`)

  // Combine all genres (deduplicated)
  const allGenres = [...new Set([
    ...artist.ourGenres,
    ...artist.spotifyGenres,
  ])]
  if (allGenres.length > 0) {
    parts.push(`Genres: ${allGenres.join(', ')}`)
  }

  // MusicBrainz tags add qualitative texture
  if (artist.musicbrainzTags.length > 0) {
    // Limit to top 10 tags to avoid embedding noise
    const tags = artist.musicbrainzTags.slice(0, 10)
    parts.push(`Tags: ${tags.join(', ')}`)
  }

  // Description if available
  if (artist.description) {
    parts.push(artist.description)
  }

  return parts.join('\n\n')
}

/**
 * Generate and save a profile embedding for an artist
 */
export async function generateArtistProfileEmbedding(artistId: string): Promise<{
  success: boolean
  profileText?: string
  error?: string
}> {
  try {
    // Fetch artist with all enrichment data
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: {
        id: true,
        name: true,
        genres: true,
        spotifyGenres: true,
        musicbrainzTags: true,
        musicbrainzDescription: true,
      },
    })

    if (!artist) {
      return { success: false, error: 'Artist not found' }
    }

    // Build profile data
    const profileData: ArtistProfileData = {
      id: artist.id,
      name: artist.name,
      ourGenres: artist.genres || [],
      spotifyGenres: artist.spotifyGenres || [],
      musicbrainzTags: artist.musicbrainzTags || [],
      description: artist.musicbrainzDescription,
    }

    // Build the text to embed
    const profileText = buildArtistProfileText(profileData)

    // Generate embedding
    const embedding = await generateEmbedding(profileText)

    // Save to database using raw SQL (for vector type)
    // Must format as string with square brackets for PostgreSQL vector type
    const embeddingStr = `[${embedding.join(',')}]`
    await prisma.$executeRawUnsafe(
      `UPDATE artists
       SET "profileEmbedding" = $1::vector,
           "profileEmbeddingUpdatedAt" = NOW()
       WHERE id = $2`,
      embeddingStr,
      artistId
    )

    return { success: true, profileText }
  } catch (err) {
    console.error(`Error generating profile embedding for artist ${artistId}:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Batch generate profile embeddings for artists
 */
export async function generateArtistProfileEmbeddings(limit = 50): Promise<{
  processed: number
  generated: number
  errors: number
}> {
  // Find artists that need profile embeddings
  // Prioritize those with the most enrichment data
  const artists = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM artists
    WHERE "profileEmbedding" IS NULL
      AND (
        array_length("spotifyGenres", 1) > 0
        OR array_length("musicbrainzTags", 1) > 0
        OR array_length(genres, 1) > 0
      )
    ORDER BY
      COALESCE(array_length("spotifyGenres", 1), 0) +
      COALESCE(array_length("musicbrainzTags", 1), 0) DESC
    LIMIT ${limit}
  `

  let processed = 0
  let generated = 0
  let errors = 0

  for (const artist of artists) {
    const result = await generateArtistProfileEmbedding(artist.id)
    processed++

    if (result.success) {
      generated++
    } else {
      errors++
    }

    // Small delay to avoid hitting OpenAI rate limits
    await sleep(100)
  }

  return { processed, generated, errors }
}

/**
 * Build and save a user's taste profile embedding
 * Combines embeddings from favorite artists with interest description
 */
export async function buildUserTasteProfile(userId: string): Promise<{
  success: boolean
  artistCount?: number
  error?: string
}> {
  try {
    // Get user with favorites and interest description
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        interestDescription: true,
        favoriteArtists: {
          select: {
            artistId: true,
          },
        },
      },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const artistIds = user.favoriteArtists.map((f) => f.artistId)

    if (artistIds.length === 0 && !user.interestDescription) {
      // Nothing to build a profile from
      return { success: true, artistCount: 0 }
    }

    // Get artist embeddings
    let artistEmbeddings: number[][] = []
    if (artistIds.length > 0) {
      const artists = await prisma.$queryRaw<Array<{ embedding: string }>>`
        SELECT "profileEmbedding"::text as embedding
        FROM artists
        WHERE id = ANY(${artistIds})
          AND "profileEmbedding" IS NOT NULL
      `

      artistEmbeddings = artists
        .map((a) => {
          try {
            // Parse the vector string format: [0.1,0.2,...]
            return JSON.parse(a.embedding) as number[]
          } catch {
            return null
          }
        })
        .filter((e): e is number[] => e !== null)
    }

    // Generate interest description embedding if available
    let interestEmbedding: number[] | null = null
    if (user.interestDescription) {
      interestEmbedding = await generateEmbedding(user.interestDescription)

      // Save interest embedding
      const interestEmbeddingStr = `[${interestEmbedding.join(',')}]`
      await prisma.$executeRawUnsafe(
        `UPDATE users
         SET "interestEmbedding" = $1::vector
         WHERE id = $2`,
        interestEmbeddingStr,
        userId
      )
    }

    // Compute taste profile
    let tasteProfile: number[] | null = null

    if (artistEmbeddings.length > 0 && interestEmbedding) {
      // Blend artist average with interest description
      const artistAvg = averageEmbeddings(artistEmbeddings)
      tasteProfile = blendEmbeddings(
        artistAvg,
        interestEmbedding,
        ARTIST_EMBEDDING_WEIGHT,
        INTEREST_EMBEDDING_WEIGHT
      )
    } else if (artistEmbeddings.length > 0) {
      // Just use artist average
      tasteProfile = averageEmbeddings(artistEmbeddings)
    } else if (interestEmbedding) {
      // Just use interest description
      tasteProfile = interestEmbedding
    }

    if (tasteProfile) {
      const tasteProfileStr = `[${tasteProfile.join(',')}]`
      await prisma.$executeRawUnsafe(
        `UPDATE users
         SET "tasteProfileEmbedding" = $1::vector,
             "tasteProfileUpdatedAt" = NOW()
         WHERE id = $2`,
        tasteProfileStr,
        userId
      )
    }

    return { success: true, artistCount: artistEmbeddings.length }
  } catch (err) {
    console.error(`Error building taste profile for user ${userId}:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Average multiple embedding vectors
 */
function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error('Cannot average empty embeddings array')
  }

  const dim = embeddings[0]!.length
  const avg = new Array(dim).fill(0) as number[]

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i]!
    }
  }

  for (let i = 0; i < dim; i++) {
    avg[i] /= embeddings.length
  }

  return avg
}

/**
 * Blend two embeddings with given weights
 */
function blendEmbeddings(
  emb1: number[],
  emb2: number[],
  weight1: number,
  weight2: number
): number[] {
  const total = weight1 + weight2
  const w1 = weight1 / total
  const w2 = weight2 / total

  return emb1.map((v, i) => v * w1 + emb2[i]! * w2)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
