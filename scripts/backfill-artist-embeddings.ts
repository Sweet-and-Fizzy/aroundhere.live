/**
 * Backfill artist profile embeddings
 *
 * Usage: npx tsx scripts/backfill-artist-embeddings.ts [--limit N]
 *
 * This script:
 * 1. Finds artists with enrichment data but no profile embedding
 * 2. Combines our genres, Spotify genres, and MusicBrainz tags
 * 3. Generates and saves embeddings using OpenAI
 */

import 'dotenv/config'
import prisma from '../server/utils/prisma'
import { generateArtistProfileEmbeddings } from '../server/services/artist-profile'

async function backfillArtistEmbeddings(limit: number) {
  console.log('Starting artist profile embeddings backfill...')

  // Count artists that need embeddings (using raw SQL for vector type)
  const needsEmbedding = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM artists
    WHERE "profileEmbedding" IS NULL
      AND (
        array_length("spotifyGenres", 1) > 0
        OR array_length("musicbrainzTags", 1) > 0
        OR array_length(genres, 1) > 0
      )
  `
  const total = Number(needsEmbedding[0]?.count || 0)

  console.log(`Found ${total} artists needing profile embeddings`)

  if (total === 0) {
    console.log('No artists to process.')
    return
  }

  // Count by enrichment source (using raw SQL for vector type)
  const withSpotify = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM artists
    WHERE array_length("spotifyGenres", 1) > 0
      AND "profileEmbedding" IS NULL
  `
  const withMusicBrainz = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM artists
    WHERE array_length("musicbrainzTags", 1) > 0
      AND "profileEmbedding" IS NULL
  `
  const withOurGenres = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM artists
    WHERE array_length(genres, 1) > 0
      AND "profileEmbedding" IS NULL
  `

  console.log(`  With Spotify genres: ${Number(withSpotify[0]?.count || 0)}`)
  console.log(`  With MusicBrainz tags: ${Number(withMusicBrainz[0]?.count || 0)}`)
  console.log(`  With our genres: ${Number(withOurGenres[0]?.count || 0)}`)

  console.log(`\nProcessing up to ${limit} artists...\n`)

  const startTime = Date.now()
  const result = await generateArtistProfileEmbeddings(limit)
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n--- Results ---')
  console.log(`Processed: ${result.processed}`)
  console.log(`Generated: ${result.generated}`)
  console.log(`Errors: ${result.errors}`)
  console.log(`Duration: ${duration}s`)

  // Show some examples
  const samples = await prisma.$queryRaw<Array<{
    name: string
    spotifyGenres: string[]
    musicbrainzTags: string[]
    genres: string[]
  }>>`
    SELECT name, "spotifyGenres", "musicbrainzTags", genres
    FROM artists
    WHERE "profileEmbedding" IS NOT NULL
    ORDER BY "profileEmbeddingUpdatedAt" DESC
    LIMIT 5
  `

  if (samples.length > 0) {
    console.log('\nSample artists with embeddings:')
    for (const s of samples) {
      const sources: string[] = []
      if (s.spotifyGenres?.length > 0) sources.push(`${s.spotifyGenres.length} spotify genres`)
      if (s.musicbrainzTags?.length > 0) sources.push(`${s.musicbrainzTags.length} mb tags`)
      if (s.genres?.length > 0) sources.push(`${s.genres.length} our genres`)
      console.log(`  ${s.name}: ${sources.join(', ')}`)
    }
  }

  // Show remaining count
  const remaining = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM artists
    WHERE "profileEmbedding" IS NULL
      AND (
        array_length("spotifyGenres", 1) > 0
        OR array_length("musicbrainzTags", 1) > 0
        OR array_length(genres, 1) > 0
      )
  `
  console.log(`\nRemaining to process: ${Number(remaining[0]?.count || 0)}`)
}

// Parse CLI args
const args = process.argv.slice(2)
let limit = 50 // Default

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1], 10)
    i++
  }
}

backfillArtistEmbeddings(limit)
  .catch(console.error)
  .finally(() => prisma.$disconnect())
