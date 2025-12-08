/**
 * Trigger artist matching job
 * POST /api/spotify/artists/match
 *
 * Body: { limit?: number, notify?: boolean }
 */

import { matchPendingArtists, getMatchingStats } from '../../../services/spotify/artist-matcher'
import { notifyArtistMatchingResults } from '../../../services/notifications'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const limit = body?.limit || 50
  const notify = body?.notify !== false // Default to true

  const result = await matchPendingArtists(limit)
  const stats = await getMatchingStats()

  // Send Slack notification if enabled and there are results worth notifying
  if (notify && result.processed > 0) {
    const baseUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://aroundhere.live'
    await notifyArtistMatchingResults({
      processed: result.processed,
      autoMatched: result.autoMatched,
      needsReview: result.needsReview,
      noMatch: result.noMatch,
      errors: result.errors,
      adminUrl: `${baseUrl}/admin/spotify`,
    })
  }

  return {
    job: result,
    stats,
  }
})
