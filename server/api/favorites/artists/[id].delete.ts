import prisma from '../../../utils/prisma'
import { buildUserTasteProfile } from '../../../services/artist-profile'

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

  // Rebuild taste profile in background (don't await)
  buildUserTasteProfile(userId).catch(err => {
    console.error('Failed to rebuild taste profile after removing artist:', err)
  })

  return { success: true }
})
