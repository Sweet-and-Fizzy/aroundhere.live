/**
 * Cron endpoint for MusicBrainz artist matching
 * POST /api/cron/musicbrainz
 *
 * Authentication: Requires CRON_SECRET token via query param or header
 *
 * Recommended crontab (run after Spotify matching):
 *   Match artists daily at 5:30am: 30 5 * * * curl -sX POST "http://localhost:3000/api/cron/musicbrainz?token=$CRON_SECRET"
 */

import { verifyCronAuth } from '../../utils/cron-auth'
import { matchPendingArtists, getMatchingStats } from '../../services/musicbrainz/artist-matcher'

export default defineEventHandler(async (event) => {
  // Verify cron authentication
  verifyCronAuth(event)

  const start = Date.now()

  console.log('[Cron] Starting MusicBrainz artist matching...')

  try {
    const result = await matchPendingArtists(50)
    const stats = await getMatchingStats()

    console.log(`[Cron] MusicBrainz matching complete: ${result.processed} processed, ${result.autoMatched} auto-matched, ${result.needsReview} needs review, ${result.noMatch} no match`)

    return {
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      success: true,
      result: {
        processed: result.processed,
        autoMatched: result.autoMatched,
        needsReview: result.needsReview,
        noMatch: result.noMatch,
        errors: result.errors,
      },
      stats,
    }
  } catch (error) {
    console.error('[Cron] MusicBrainz matching failed:', error)

    return {
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})
