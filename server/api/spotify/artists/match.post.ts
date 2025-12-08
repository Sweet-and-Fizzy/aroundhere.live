/**
 * Trigger artist matching job
 * POST /api/spotify/artists/match
 *
 * Body: { limit?: number }
 */

import { matchPendingArtists, getMatchingStats } from '../../../services/spotify/artist-matcher'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const limit = body?.limit || 50

  const result = await matchPendingArtists(limit)
  const stats = await getMatchingStats()

  return {
    job: result,
    stats,
  }
})
