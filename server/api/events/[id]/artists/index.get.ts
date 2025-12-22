/**
 * Get artists for an event
 * GET /api/events/:id/artists
 */

import { prisma } from '../../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id')
  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const eventRecord = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      eventArtists: {
        include: {
          artist: {
            select: {
              id: true,
              name: true,
              slug: true,
              genres: true,
              isLocal: true,
              spotifyId: true,
              spotifyName: true,
              spotifyMatchStatus: true,
            },
          },
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  })

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  return {
    eventId: eventRecord.id,
    eventTitle: eventRecord.title,
    artists: eventRecord.eventArtists.map(ea => ({
      id: ea.id,
      artistId: ea.artist.id,
      order: ea.order,
      setTime: ea.setTime,
      artist: ea.artist,
    })),
  }
})
