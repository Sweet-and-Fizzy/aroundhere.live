import prisma from '../../../utils/prisma'
import { CANONICAL_GENRES } from '../../../services/classifier/types'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string
  const genre = getRouterParam(event, 'slug')

  if (!genre) {
    throw createError({
      statusCode: 400,
      message: 'Genre slug is required',
    })
  }

  // Validate that the genre is a recognized canonical genre
  if (!CANONICAL_GENRES.includes(genre as any)) {
    throw createError({
      statusCode: 400,
      message: `Invalid genre: ${genre}`,
    })
  }

  await prisma.userFavoriteGenre.deleteMany({
    where: {
      userId,
      genre,
    },
  })

  return { success: true }
})
