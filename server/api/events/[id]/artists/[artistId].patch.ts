/**
 * Update an artist's position/details on an event
 * PATCH /api/events/:id/artists/:artistId
 *
 * Body:
 *   { order: number } - New billing order (1 = headliner)
 *   { setTime: string } - Set time (ISO date string)
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

  const body = await readBody(event)

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

  const updateData: {
    order?: number
    setTime?: Date | null
  } = {}

  // Update order
  if (typeof body.order === 'number') {
    const newOrder = Math.max(1, body.order)

    // Get all artists for this event
    const allArtists = await prisma.eventArtist.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
    })

    const oldOrder = eventArtist.order
    const maxOrder = allArtists.length

    // Clamp to valid range
    const clampedOrder = Math.min(newOrder, maxOrder)

    if (clampedOrder !== oldOrder) {
      // Shift other artists to make room
      if (clampedOrder < oldOrder) {
        // Moving up: shift artists between new and old position down
        await prisma.eventArtist.updateMany({
          where: {
            eventId,
            order: {
              gte: clampedOrder,
              lt: oldOrder,
            },
          },
          data: {
            order: { increment: 1 },
          },
        })
      } else {
        // Moving down: shift artists between old and new position up
        await prisma.eventArtist.updateMany({
          where: {
            eventId,
            order: {
              gt: oldOrder,
              lte: clampedOrder,
            },
          },
          data: {
            order: { decrement: 1 },
          },
        })
      }

      updateData.order = clampedOrder
    }
  }

  // Update setTime
  if (body.setTime !== undefined) {
    updateData.setTime = body.setTime ? new Date(body.setTime) : null
  }

  if (Object.keys(updateData).length === 0) {
    // Nothing to update, return current state
    const current = await prisma.eventArtist.findUnique({
      where: { id: eventArtist.id },
      include: {
        artist: {
          select: {
            id: true,
            name: true,
            slug: true,
            genres: true,
            spotifyId: true,
            spotifyMatchStatus: true,
          },
        },
      },
    })
    return current
  }

  const updated = await prisma.eventArtist.update({
    where: { id: eventArtist.id },
    data: updateData,
    include: {
      artist: {
        select: {
          id: true,
          name: true,
          slug: true,
          genres: true,
          spotifyId: true,
          spotifyMatchStatus: true,
        },
      },
    },
  })

  return {
    id: updated.id,
    artistId: updated.artistId,
    order: updated.order,
    setTime: updated.setTime,
    artist: updated.artist,
  }
})
