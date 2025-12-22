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
  const body = await readBody(event)

  if (!body.genre || typeof body.genre !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'genre slug is required',
    })
  }

  const genreSlug = body.genre.toLowerCase().trim()

  // Validate that the genre is a recognized canonical genre
  if (!CANONICAL_GENRES.includes(genreSlug as any)) {
    throw createError({
      statusCode: 400,
      message: `Invalid genre: ${genreSlug}`,
    })
  }

  // Create favorite (upsert to handle duplicates gracefully)
  await prisma.userFavoriteGenre.upsert({
    where: {
      userId_genre: {
        userId,
        genre: genreSlug,
      },
    },
    update: {},
    create: {
      userId,
      genre: genreSlug,
    },
  })

  return { success: true, genre: genreSlug }
})
