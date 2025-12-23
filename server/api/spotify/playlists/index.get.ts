/**
 * Get all configured playlists with sync status
 * GET /api/spotify/playlists
 */

import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async () => {
  const playlists = await prisma.spotifyPlaylist.findMany({
    include: {
      region: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Get track counts
  const trackCounts = await prisma.spotifyPlaylistTrack.groupBy({
    by: ['playlistId'],
    _count: { id: true },
  })

  const countMap = new Map(trackCounts.map(tc => [tc.playlistId, tc._count.id]))

  return {
    playlists: playlists.map(p => ({
      id: p.id,
      playlistId: p.playlistId,
      name: p.name,
      description: p.description,
      regionId: p.regionId,
      region: p.region,
      daysAhead: p.daysAhead,
      syncEnabled: p.syncEnabled,
      lastSyncedAt: p.lastSyncedAt,
      lastSyncError: p.lastSyncError,
      trackCount: countMap.get(p.playlistId) || 0,
    })),
  }
})
