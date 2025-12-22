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
  const artistId = getRouterParam(event, 'id')

  if (!artistId) {
    throw createError({
      statusCode: 400,
      message: 'Artist ID is required',
    })
  }

  await prisma.userFavoriteArtist.deleteMany({
    where: {
      userId,
      artistId,
    },
  })

  return { success: true }
})
