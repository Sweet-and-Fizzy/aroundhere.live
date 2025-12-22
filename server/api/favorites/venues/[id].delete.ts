import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string
  const venueId = getRouterParam(event, 'id')

  if (!venueId) {
    throw createError({
      statusCode: 400,
      message: 'Venue ID is required',
    })
  }

  await prisma.userFavoriteVenue.deleteMany({
    where: {
      userId,
      venueId,
    },
  })

  return { success: true }
})
