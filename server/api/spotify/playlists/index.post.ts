/**
 * Add a new playlist to sync
 * POST /api/spotify/playlists
 *
 * Body: { playlistId, name, description?, regionId?, daysAhead? }
 */

import { prisma } from '../../../utils/prisma'
import { spotifyService } from '../../../services/spotify'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.playlistId) {
    throw createError({
      statusCode: 400,
      message: 'playlistId is required',
    })
  }

  // Verify we have Spotify auth
  if (!spotifyService.isConfigured()) {
    throw createError({
      statusCode: 500,
      message: 'Spotify not configured',
    })
  }

  // Check if playlist already exists
  const existing = await prisma.spotifyPlaylist.findUnique({
    where: { playlistId: body.playlistId },
  })

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'Playlist already configured',
    })
  }

  // Create playlist record
  const playlist = await prisma.spotifyPlaylist.create({
    data: {
      playlistId: body.playlistId,
      name: body.name || `Playlist ${body.playlistId}`,
      description: body.description || null,
      regionId: body.regionId || null,
      daysAhead: body.daysAhead || 30,
      syncEnabled: true,
    },
  })

  return {
    success: true,
    playlist: {
      id: playlist.id,
      playlistId: playlist.playlistId,
      name: playlist.name,
      syncEnabled: playlist.syncEnabled,
    },
  }
})
