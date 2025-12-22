import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string

  const [artists, venues, genres, eventTypes] = await Promise.all([
    prisma.userFavoriteArtist.findMany({
      where: { userId },
      include: {
        artist: {
          select: {
            id: true,
            name: true,
            slug: true,
            genres: true,
            spotifyId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userFavoriteVenue.findMany({
      where: { userId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            state: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userFavoriteGenre.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userFavoriteEventType.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return {
    artists: artists.map(f => f.artist),
    venues: venues.map(f => f.venue),
    genres: genres.map(f => f.genre),
    eventTypes: eventTypes.map(f => f.eventType),
  }
})
