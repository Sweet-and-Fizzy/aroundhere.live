/**
 * Remove an artist from an event
 * DELETE /api/events/:id/artists/:artistId
 */

import { prisma } from '../../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id')
  const artistId = getRouterParam(event, 'artistId')

  if (!eventId || !artistId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Artist ID are required',
    })
  }

  // Check if the link exists
  const eventArtist = await prisma.eventArtist.findUnique({
    where: {
      eventId_artistId: {
        eventId,
        artistId,
      },
    },
  })

  if (!eventArtist) {
    throw createError({
      statusCode: 404,
      message: 'Artist is not linked to this event',
    })
  }

  // Delete the link
  await prisma.eventArtist.delete({
    where: {
      eventId_artistId: {
        eventId,
        artistId,
      },
    },
  })

  // Reorder remaining artists to close gaps
  const remainingArtists = await prisma.eventArtist.findMany({
    where: { eventId },
    orderBy: { order: 'asc' },
  })

  // Update orders to be sequential starting from 1
  for (let i = 0; i < remainingArtists.length; i++) {
    const artist = remainingArtists[i]
    if (artist && artist.order !== i + 1) {
      await prisma.eventArtist.update({
        where: { id: artist.id },
        data: { order: i + 1 },
      })
    }
  }

  return { success: true }
})
