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
  })

  if (!venue) {
    throw createError({
      statusCode: 404,
      message: 'Venue not found',
    })
  }

  await prisma.venue.delete({
    where: { id },
  })

  return { success: true }
})
