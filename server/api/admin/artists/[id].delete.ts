/**
 * Delete an artist
 * DELETE /api/admin/artists/:id
 */

import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const artistId = getRouterParam(event, 'id')
  if (!artistId) {
    throw createError({
      statusCode: 400,
      message: 'Artist ID is required',
    })
  }

  // Verify artist exists
  const existing = await prisma.artist.findUnique({
    where: { id: artistId },
    include: {
      _count: {
        select: {
          eventArtists: true,
          favoritedBy: true,
        },
      },
    },
  })

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Artist not found',
    })
  }

  // Delete the artist (cascades to eventArtists and favorites)
  await prisma.artist.delete({
    where: { id: artistId },
  })

  return {
    success: true,
    deleted: {
      id: existing.id,
      name: existing.name,
      eventCount: existing._count.eventArtists,
      favoriteCount: existing._count.favoritedBy,
    },
  }
})
