/**
 * Update a playlist configuration
 * PATCH /api/spotify/playlists/:playlistId
 *
 * Body: { name?, description?, daysAhead?, syncEnabled?, regionId? }
 */

import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')
  const body = await readBody(event)

  if (!playlistId) {
    throw createError({
      statusCode: 400,
      message: 'playlistId is required',
    })
  }

  const playlist = await prisma.spotifyPlaylist.findUnique({
    where: { playlistId },
  })

  if (!playlist) {
    throw createError({
      statusCode: 404,
      message: 'Playlist not found',
    })
  }

  const updated = await prisma.spotifyPlaylist.update({
    where: { playlistId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.daysAhead !== undefined && { daysAhead: body.daysAhead }),
      ...(body.syncEnabled !== undefined && { syncEnabled: body.syncEnabled }),
      // Allow setting regionId to null (global) or a valid region ID
      ...(body.regionId !== undefined && { regionId: body.regionId || null }),
    },
    include: {
      region: {
        select: { id: true, name: true, slug: true },
      },
    },
  })

  return {
    success: true,
    playlist: {
      id: updated.id,
      playlistId: updated.playlistId,
      name: updated.name,
      description: updated.description,
      regionId: updated.regionId,
      region: updated.region,
      daysAhead: updated.daysAhead,
      syncEnabled: updated.syncEnabled,
    },
  }
})
