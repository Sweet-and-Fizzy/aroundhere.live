/**
 * Backfill MusicBrainz data for existing artists
 *
 * Usage: npx tsx scripts/backfill-musicbrainz.ts [--limit N]
 *
 * This script:
 * 1. Finds artists with PENDING MusicBrainz status
 * 2. Searches MusicBrainz for matches
 * 3. Updates status to AUTO_MATCHED, NEEDS_REVIEW, or NO_MATCH
 * 4. Fetches tags and related artists for matched artists
 */

import 'dotenv/config'
import prisma from '../server/utils/prisma'
import { matchPendingArtists, getMatchingStats } from '../server/services/musicbrainz/artist-matcher'

async function backfillMusicBrainz(limit: number) {
  console.log('Starting MusicBrainz backfill...')

  // Get current stats
  const statsBefore = await getMatchingStats()
  console.log('\nCurrent status:')
  console.log(`  Pending: ${statsBefore.pending}`)
  console.log(`  Auto-matched: ${statsBefore.autoMatched}`)
  console.log(`  Needs review: ${statsBefore.needsReview}`)
  console.log(`  Verified: ${statsBefore.verified}`)
  console.log(`  No match: ${statsBefore.noMatch}`)
  console.log(`  Total: ${statsBefore.total}`)

  if (statsBefore.pending === 0) {
    console.log('\nNo pending artists to process.')
    return
  }

  console.log(`\nProcessing up to ${limit} artists...`)
  console.log('(MusicBrainz requires 1 request/second, this will take a while)\n')

  const startTime = Date.now()
  const result = await matchPendingArtists(limit)
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n--- Results ---')
  console.log(`Processed: ${result.processed}`)
  console.log(`Auto-matched: ${result.autoMatched}`)
  console.log(`Needs review: ${result.needsReview}`)
  console.log(`No match: ${result.noMatch}`)
  console.log(`Errors: ${result.errors}`)
  console.log(`Duration: ${duration}s`)

  // Show some examples
  const matched = result.results.filter(r => r.status === 'AUTO_MATCHED').slice(0, 5)
  if (matched.length > 0) {
    console.log('\nSample auto-matched artists:')
    for (const m of matched) {
      console.log(`  ${m.artistName} -> ${m.musicbrainzId} (${m.tagsCount} tags, confidence: ${m.confidence?.toFixed(2)})`)
    }
  }

  const needsReview = result.results.filter(r => r.status === 'NEEDS_REVIEW').slice(0, 5)
  if (needsReview.length > 0) {
    console.log('\nSample needing review:')
    for (const r of needsReview) {
      console.log(`  ${r.artistName} -> ${r.musicbrainzId} (confidence: ${r.confidence?.toFixed(2)})`)
    }
  }

  // Get updated stats
  const statsAfter = await getMatchingStats()
  console.log('\nUpdated status:')
  console.log(`  Pending: ${statsAfter.pending} (${statsAfter.pending - statsBefore.pending})`)
  console.log(`  Auto-matched: ${statsAfter.autoMatched} (+${statsAfter.autoMatched - statsBefore.autoMatched})`)
  console.log(`  Needs review: ${statsAfter.needsReview} (+${statsAfter.needsReview - statsBefore.needsReview})`)
  console.log(`  No match: ${statsAfter.noMatch} (+${statsAfter.noMatch - statsBefore.noMatch})`)
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

backfillMusicBrainz(limit)
  .catch(console.error)
  .finally(() => prisma.$disconnect())
