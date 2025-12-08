/**
 * Get artist matching statistics
 * GET /api/spotify/artists/stats
 */

import { getMatchingStats } from '../../../services/spotify/artist-matcher'

export default defineEventHandler(async () => {
  return getMatchingStats()
})
