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

  if (!body.venueId) {
    throw createError({
      statusCode: 400,
      message: 'venueId is required',
    })
  }

  // Verify venue exists
  const venue = await prisma.venue.findUnique({
    where: { id: body.venueId },
    select: { id: true, name: true, slug: true },
  })

  if (!venue) {
    throw createError({
      statusCode: 404,
      message: 'Venue not found',
    })
  }

  // Create favorite (upsert to handle duplicates gracefully)
  const favorite = await prisma.userFavoriteVenue.upsert({
    where: {
      userId_venueId: {
        userId,
        venueId: body.venueId,
      },
    },
    update: {},
    create: {
      userId,
      venueId: body.venueId,
    },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })

  return { success: true, venue: favorite.venue }
})
