import prisma from '../../../utils/prisma'
import { setCacheHeaders } from '../../../utils/cache'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: 'Artist slug is required',
    })
  }

  const artist = await prisma.artist.findFirst({
    where: { slug },
    include: {
      artistReviews: {
        include: {
          review: {
            include: {
              source: {
                select: {
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
        orderBy: {
          review: {
            publishedAt: 'desc',
          },
        },
        take: 5,
      },
    },
  })

  if (!artist) {
    throw createError({
      statusCode: 404,
      message: 'Artist not found',
    })
  }

  // Get upcoming events for this artist
  const upcomingEvents = await prisma.event.findMany({
    where: {
      eventArtists: {
        some: {
          artistId: artist.id,
        },
      },
      startsAt: { gte: new Date() },
      reviewStatus: { in: ['APPROVED', 'PENDING'] },
    },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          state: true,
        },
      },
      eventArtists: {
        include: {
          artist: {
            select: {
              id: true,
              name: true,
              slug: true,
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

  // Get past events count
  const pastEventsCount = await prisma.event.count({
    where: {
      eventArtists: {
        some: {
          artistId: artist.id,
        },
      },
      startsAt: { lt: new Date() },
      reviewStatus: { in: ['APPROVED', 'PENDING'] },
    },
  })

  return {
    artist,
    upcomingEvents,
    pastEventsCount,
  }
})
