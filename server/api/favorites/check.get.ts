import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    // Return empty sets for unauthenticated users
    return {
      artistIds: [],
      venueIds: [],
      genres: [],
    }
  }

  const userId = session.user.id as string
  const query = getQuery(event)

  // Parse query params - can pass comma-separated IDs
  const artistIds = query.artistIds
    ? (query.artistIds as string).split(',').filter(Boolean)
    : []
  const venueIds = query.venueIds
    ? (query.venueIds as string).split(',').filter(Boolean)
    : []
  const genres = query.genres
    ? (query.genres as string).split(',').filter(Boolean)
    : []

  const results = await Promise.all([
    artistIds.length > 0
      ? prisma.userFavoriteArtist.findMany({
          where: {
            userId,
            artistId: { in: artistIds },
          },
          select: { artistId: true },
        })
      : [],
    venueIds.length > 0
      ? prisma.userFavoriteVenue.findMany({
          where: {
            userId,
            venueId: { in: venueIds },
          },
          select: { venueId: true },
        })
      : [],
    genres.length > 0
      ? prisma.userFavoriteGenre.findMany({
          where: {
            userId,
            genre: { in: genres },
          },
          select: { genre: true },
        })
      : [],
  ])

  return {
    artistIds: results[0].map(f => f.artistId),
    venueIds: results[1].map(f => f.venueId),
    genres: results[2].map(f => f.genre),
  }
})
