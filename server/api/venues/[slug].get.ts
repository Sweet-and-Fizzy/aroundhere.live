import prisma from '../../utils/prisma'
import { setCacheHeaders } from '../../utils/cache'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: 'Venue slug is required',
    })
  }

  const venue = await prisma.venue.findFirst({
    where: { slug },
    include: {
      region: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })

  if (!venue) {
    throw createError({
      statusCode: 404,
      message: 'Venue not found',
    })
  }

  // Get upcoming events for this venue
  const events = await prisma.event.findMany({
    where: {
      venueId: venue.id,
      startsAt: { gte: new Date() },
      reviewStatus: { in: ['APPROVED', 'PENDING'] },
      isCancelled: false,
    },
    include: {
      eventArtists: {
        include: {
          artist: {
            select: {
              id: true,
              name: true,
              slug: true,
              genres: true,
            },
          },
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
    take: 50,
  })

  return {
    venue,
    events,
  }
})
