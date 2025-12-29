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

// Weights for blending user taste profile components
// Artists carry the most weight since they represent specific taste
// Preferences (genres + event types) are explicit signals
// Interest description is free-form text with helpful context
const ARTIST_EMBEDDING_WEIGHT = 0.5
const PREFERENCES_EMBEDDING_WEIGHT = 0.3
const INTEREST_EMBEDDING_WEIGHT = 0.2

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

// Track pending taste profile builds to debounce rapid changes
const pendingBuilds = new Map<string, NodeJS.Timeout>()
const DEBOUNCE_MS = 2000 // Wait 2 seconds after last change before building

/**
 * Build and save a user's taste profile embedding (debounced)
 *
 * Combines embeddings from multiple sources:
 * - Favorite artists (their profile embeddings averaged)
 * - Favorite genres and event types (as text, embedded)
 * - Interest description (free-form text, embedded)
 *
 * The final embedding captures the user's full taste profile for
 * semantic similarity matching against events.
 *
 * This function is debounced - if called multiple times rapidly for the
 * same user, only the last call will actually build the profile.
 */
export function buildUserTasteProfile(userId: string): Promise<{
  success: boolean
  artistCount?: number
  error?: string
}> {
  return new Promise((resolve) => {
    // Clear any pending build for this user
    const existing = pendingBuilds.get(userId)
    if (existing) {
      clearTimeout(existing)
    }

    // Schedule a new build after debounce period
    const timeout = setTimeout(async () => {
      pendingBuilds.delete(userId)
      const result = await buildUserTasteProfileImmediate(userId)
      resolve(result)
    }, DEBOUNCE_MS)

    pendingBuilds.set(userId, timeout)
  })
}

/**
 * Build taste profile immediately (no debounce)
 * Used by cron jobs and when immediate rebuild is needed
 */
export async function buildUserTasteProfileImmediate(userId: string): Promise<{
  success: boolean
  artistCount?: number
  error?: string
}> {
  try {
    // Get user with all favorites and interest description
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
        favoriteGenres: {
          select: {
            genre: true,
          },
        },
        favoriteEventTypes: {
          select: {
            eventType: true,
          },
        },
      },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const artistIds = user.favoriteArtists.map((f) => f.artistId)
    const genres = user.favoriteGenres.map((f) => f.genre)
    const eventTypes = user.favoriteEventTypes.map((f) => f.eventType)

    const hasArtists = artistIds.length > 0
    const hasPreferences = genres.length > 0 || eventTypes.length > 0
    const hasInterest = !!user.interestDescription

    if (!hasArtists && !hasPreferences && !hasInterest) {
      // Nothing to build a profile from
      return { success: true, artistCount: 0 }
    }

    // Get artist embeddings
    let artistEmbeddings: number[][] = []
    if (hasArtists) {
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

    // Generate preferences embedding (genres + event types as text)
    let preferencesEmbedding: number[] | null = null
    if (hasPreferences) {
      const preferencesText = buildPreferencesText(genres, eventTypes)
      preferencesEmbedding = await generateEmbedding(preferencesText)
    }

    // Generate interest description embedding if available
    let interestEmbedding: number[] | null = null
    if (hasInterest) {
      interestEmbedding = await generateEmbedding(user.interestDescription!)

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

    // Compute taste profile by blending available embeddings
    const tasteProfile = blendTasteProfile(
      artistEmbeddings.length > 0 ? averageEmbeddings(artistEmbeddings) : null,
      preferencesEmbedding,
      interestEmbedding
    )

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
 * Build text representation of user's genre and event type preferences
 * for embedding. Uses descriptive language to capture the semantic meaning.
 */
function buildPreferencesText(genres: string[], eventTypes: string[]): string {
  const parts: string[] = []

  if (genres.length > 0) {
    // Map genre slugs to readable names
    const genreLabels: Record<string, string> = {
      'rock': 'rock music',
      'indie': 'indie and alternative music',
      'folk': 'folk and acoustic music',
      'jazz': 'jazz music',
      'blues': 'blues music',
      'country': 'country music',
      'electronic': 'electronic and dance music',
      'hip-hop': 'hip-hop and rap music',
      'r-and-b': 'R&B and soul music',
      'funk': 'funk music',
      'punk': 'punk rock',
      'metal': 'metal and heavy music',
      'classical': 'classical music',
      'world': 'world music',
      'latin': 'latin music',
      'reggae': 'reggae music',
      'jam': 'jam bands and improvisation',
      'americana': 'americana and roots music',
      'singer-songwriter': 'singer-songwriter',
      'experimental': 'experimental and avant-garde music',
    }
    const genreNames = genres.map(g => genreLabels[g] || g)
    parts.push(`Interested in: ${genreNames.join(', ')}`)
  }

  if (eventTypes.length > 0) {
    // Map event type codes to readable descriptions
    const eventTypeLabels: Record<string, string> = {
      'MUSIC': 'live music concerts and performances',
      'DJ': 'DJ sets and dance parties',
      'OPEN_MIC': 'open mic nights',
      'COMEDY': 'comedy shows and stand-up',
      'THEATER': 'theater and stage performances',
      'DANCE': 'dance performances',
      'KARAOKE': 'karaoke nights',
      'TRIVIA': 'trivia nights',
      'FILM': 'film screenings',
      'ART': 'art shows and exhibitions',
      'WORKSHOP': 'workshops and classes',
      'LITERARY': 'literary events and readings',
    }
    const eventTypeNames = eventTypes.map(t => eventTypeLabels[t] || t)
    parts.push(`Enjoys: ${eventTypeNames.join(', ')}`)
  }

  return parts.join('. ')
}

/**
 * Blend multiple embeddings into a single taste profile.
 * Handles cases where some embeddings may be missing.
 */
function blendTasteProfile(
  artistEmb: number[] | null,
  preferencesEmb: number[] | null,
  interestEmb: number[] | null
): number[] | null {
  const embeddings: Array<{ emb: number[]; weight: number }> = []

  if (artistEmb) {
    embeddings.push({ emb: artistEmb, weight: ARTIST_EMBEDDING_WEIGHT })
  }
  if (preferencesEmb) {
    embeddings.push({ emb: preferencesEmb, weight: PREFERENCES_EMBEDDING_WEIGHT })
  }
  if (interestEmb) {
    embeddings.push({ emb: interestEmb, weight: INTEREST_EMBEDDING_WEIGHT })
  }

  if (embeddings.length === 0) {
    return null
  }

  if (embeddings.length === 1) {
    return embeddings[0]!.emb
  }

  // Normalize weights to sum to 1
  const totalWeight = embeddings.reduce((sum, e) => sum + e.weight, 0)

  const dim = embeddings[0]!.emb.length
  const result = new Array(dim).fill(0) as number[]

  for (const { emb, weight } of embeddings) {
    const normalizedWeight = weight / totalWeight
    for (let i = 0; i < dim; i++) {
      result[i]! += emb[i]! * normalizedWeight
    }
  }

  return result
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
      avg[i]! += emb[i]!
    }
  }

  for (let i = 0; i < dim; i++) {
    avg[i]! /= embeddings.length
  }

  return avg
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
