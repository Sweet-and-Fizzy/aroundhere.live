import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  // Check authentication
  const session = await getUserSession(event)
  if (!session?.user || !['ADMIN', 'MODERATOR'].includes(session.user.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Unauthorized - Admin or Moderator access required',
    })
  }

  const query = getQuery(event)
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0

  // Fetch cancelled events
  const events = await prisma.event.findMany({
    where: {
      isCancelled: true,
    },
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
      source: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      startsAt: 'desc',
    },
    take: limit,
    skip: offset,
  })

  const total = await prisma.event.count({
    where: {
      isCancelled: true,
    },
  })

  return {
    events,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + events.length < total,
    },
  }
})
