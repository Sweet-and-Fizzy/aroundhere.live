/**
 * Cron endpoint for Spotify tasks
 * POST /api/cron/spotify
 *
 * Authentication: Requires CRON_SECRET token via query param or header
 *
 * Query params:
 *   task: 'match' | 'sync' | 'refresh' | 'all'
 *
 * Recommended crontab (run after daily scraper run):
 *   Match new artists daily at 5am: 0 5 * * * curl -sX POST "http://localhost:3000/api/cron/spotify?task=match&token=$CRON_SECRET"
 *   Sync playlists daily at 6am:    0 6 * * * curl -sX POST "http://localhost:3000/api/cron/spotify?task=sync&token=$CRON_SECRET"
 *   Refresh tracks weekly Sunday:   0 3 * * 0 curl -sX POST "http://localhost:3000/api/cron/spotify?task=refresh&token=$CRON_SECRET"
 */

import { getQuery } from 'h3'
import { verifyCronAuth } from '../../utils/cron-auth'
import { matchPendingArtists, getMatchingStats, refreshPopularTracks } from '../../services/spotify/artist-matcher'
import { syncAllPlaylists } from '../../services/spotify/playlist-sync'
import { notifyArtistMatchingResults } from '../../services/notifications'

interface TaskResult {
  task: string
  success: boolean
  duration: number
  result?: unknown
  error?: string
}

export default defineEventHandler(async (event) => {
  // Verify cron authentication
  verifyCronAuth(event)

  const query = getQuery(event)
  const task = query.task as string || 'all'

  const results: TaskResult[] = []

  // Match artists
  if (task === 'match' || task === 'all') {
    const start = Date.now()
    try {
      console.log('[Cron] Starting artist matching...')
      const result = await matchPendingArtists(50)
      const stats = await getMatchingStats()

      if (result.processed > 0) {
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

      results.push({
        task: 'match',
        success: true,
        duration: Date.now() - start,
        result: { job: result, stats },
      })
    } catch (error) {
      results.push({
        task: 'match',
        success: false,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Sync playlists
  if (task === 'sync' || task === 'all') {
    const start = Date.now()
    try {
      console.log('[Cron] Starting playlist sync...')
      const syncResults = await syncAllPlaylists()

      results.push({
        task: 'sync',
        success: true,
        duration: Date.now() - start,
        result: {
          playlists: syncResults.length,
          tracksAdded: syncResults.reduce((sum, r) => sum + r.tracksAdded, 0),
          tracksRemoved: syncResults.reduce((sum, r) => sum + r.tracksRemoved, 0),
        },
      })
    } catch (error) {
      results.push({
        task: 'sync',
        success: false,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Refresh tracks
  if (task === 'refresh') {
    const start = Date.now()
    try {
      console.log('[Cron] Starting track refresh...')
      const result = await refreshPopularTracks(30, 100)

      results.push({
        task: 'refresh',
        success: true,
        duration: Date.now() - start,
        result,
      })
    } catch (error) {
      results.push({
        task: 'refresh',
        success: false,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return {
    timestamp: new Date().toISOString(),
    results,
  }
})
