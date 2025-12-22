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
  const body = await readBody(event)

  if (!body.artistId) {
    throw createError({
      statusCode: 400,
      message: 'artistId is required',
    })
  }

  // Verify artist exists
  const artist = await prisma.artist.findUnique({
    where: { id: body.artistId },
    select: { id: true, name: true, slug: true },
  })

  if (!artist) {
    throw createError({
      statusCode: 404,
      message: 'Artist not found',
    })
  }

  // Create favorite (upsert to handle duplicates gracefully)
  const favorite = await prisma.userFavoriteArtist.upsert({
    where: {
      userId_artistId: {
        userId,
        artistId: body.artistId,
      },
    },
    update: {},
    create: {
      userId,
      artistId: body.artistId,
    },
    include: {
      artist: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })

  return { success: true, artist: favorite.artist }
})
