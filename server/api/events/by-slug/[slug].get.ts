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
      venue: true,
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
          artist: true,
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
