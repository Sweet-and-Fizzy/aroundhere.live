/**
 * Remove a playlist from sync
 * DELETE /api/spotify/playlists/:playlistId
 *
 * This removes the playlist from our database but doesn't delete the Spotify playlist itself.
 */

import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')

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

  // Delete track records first
  await prisma.spotifyPlaylistTrack.deleteMany({
    where: { playlistId },
  })

  // Delete playlist config
  await prisma.spotifyPlaylist.delete({
    where: { playlistId },
  })

  return {
    success: true,
    message: `Playlist ${playlist.name} removed from sync`,
  }
})
