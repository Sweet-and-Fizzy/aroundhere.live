import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Event slug is required',
    })
  }

  const eventData = await prisma.event.findFirst({
    where: { slug },
    include: {
      venue: {
        include: {
          region: {
            select: {
              timezone: true,
            },
          },
        },
      },
      region: {
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
        },
      },
      source: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
      eventArtists: {
        include: {
          artist: {
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
                take: 3, // Limit reviews per artist
              },
            },
          },
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  })

  if (!eventData) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Event not found',
    })
  }

  return eventData
})
