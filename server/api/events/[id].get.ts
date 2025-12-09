import prisma from '../../utils/prisma'
import { setCacheHeaders } from '../../utils/cache'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Event ID is required',
    })
  }

  const eventData = await prisma.event.findUnique({
    where: { id },
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
