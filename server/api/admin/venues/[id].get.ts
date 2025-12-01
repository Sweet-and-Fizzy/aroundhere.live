import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Venue ID is required',
    })
  }

  const venue = await prisma.venue.findUnique({
    where: { id },
    include: {
      region: {
        select: { id: true, name: true },
      },
    },
  })

  if (!venue) {
    throw createError({
      statusCode: 404,
      message: 'Venue not found',
    })
  }

  return venue
})
