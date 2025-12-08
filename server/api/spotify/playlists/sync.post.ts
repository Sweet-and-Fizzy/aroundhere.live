/**
 * Trigger playlist sync
 * POST /api/spotify/playlists/sync
 *
 * Body: { playlistId? } - if not provided, syncs all enabled playlists
 */

import { syncPlaylist, syncAllPlaylists } from '../../../services/spotify/playlist-sync'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (body.playlistId) {
    // Sync specific playlist
    const result = await syncPlaylist(body.playlistId)
    return {
      success: true,
      results: [result],
    }
  } else {
    // Sync all enabled playlists
    const results = await syncAllPlaylists()
    return {
      success: true,
      results,
    }
  }
})
