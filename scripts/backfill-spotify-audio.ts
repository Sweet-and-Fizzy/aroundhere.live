/**
 * Backfill Spotify genres for matched artists
 *
 * Usage: npx tsx scripts/backfill-spotify-audio.ts [--limit N]
 *
 * This script:
 * 1. Finds artists with Spotify matches but no genres fetched
 * 2. Fetches Spotify genres for each artist
 *
 * Note: Audio features API was deprecated by Spotify in November 2024.
 */

import 'dotenv/config'
import prisma from '../server/utils/prisma'
import { enrichArtistsWithSpotifyData } from '../server/services/spotify/audio-features'

async function backfillSpotifyGenres(limit: number) {
  console.log('Starting Spotify genres backfill...')

  // Count artists that need enrichment
  const needsEnrichment = await prisma.artist.count({
    where: {
      spotifyId: { not: null },
      spotifyMatchStatus: { in: ['AUTO_MATCHED', 'VERIFIED'] },
      spotifyFetchedAt: null,
    },
  })

  console.log(`Found ${needsEnrichment} artists needing Spotify enrichment`)

  if (needsEnrichment === 0) {
    console.log('No artists to process.')
    return
  }

  console.log(`\nProcessing up to ${limit} artists...\n`)

  const startTime = Date.now()
  const result = await enrichArtistsWithSpotifyData(limit)
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n--- Results ---')
  console.log(`Processed: ${result.processed}`)
  console.log(`Enriched: ${result.enriched}`)
  console.log(`Errors: ${result.errors}`)
  console.log(`Duration: ${duration}s`)

  // Show some examples
  const samples = await prisma.artist.findMany({
    where: {
      spotifyFetchedAt: { not: null },
      spotifyGenres: { isEmpty: false },
    },
    select: {
      name: true,
      spotifyGenres: true,
    },
    orderBy: { spotifyFetchedAt: 'desc' },
    take: 5,
  })

  if (samples.length > 0) {
    console.log('\nSample enriched artists:')
    for (const s of samples) {
      const genres = s.spotifyGenres.slice(0, 3).join(', ')
      console.log(`  ${s.name}: [${genres}]`)
    }
  }

  // Show remaining count
  const remaining = await prisma.artist.count({
    where: {
      spotifyId: { not: null },
      spotifyMatchStatus: { in: ['AUTO_MATCHED', 'VERIFIED'] },
      spotifyFetchedAt: null,
    },
  })
  console.log(`\nRemaining to process: ${remaining}`)
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

backfillSpotifyGenres(limit)
  .catch(console.error)
  .finally(() => prisma.$disconnect())
