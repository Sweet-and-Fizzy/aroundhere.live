import prisma from '../../../utils/prisma'
import { CANONICAL_GENRES } from '../../../services/classifier/types'
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
  const genre = getRouterParam(event, 'slug')

  if (!genre) {
    throw createError({
      statusCode: 400,
      message: 'Genre slug is required',
    })
  }

  // Validate that the genre is a recognized canonical genre
  if (!CANONICAL_GENRES.includes(genre as typeof CANONICAL_GENRES[number])) {
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

  // Rebuild taste profile in background (don't await)
  buildUserTasteProfile(userId).catch(err => {
    console.error('Failed to rebuild taste profile after removing genre:', err)
  })

  return { success: true }
})
