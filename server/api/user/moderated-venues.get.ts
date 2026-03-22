import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const venues = await prisma.venueModerator.findMany({
    where: {
      userId,
      isActive: true,
      verifiedAt: { not: null },
    },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get pending submission counts for each venue
  const items = await Promise.all(
    venues.map(async (vm) => {
      const pendingCount = await prisma.event.count({
        where: {
          venueId: vm.venueId,
          submittedById: { not: null },
          reviewStatus: 'PENDING',
        },
      })
      return {
        ...vm,
        pendingCount,
      }
    })
  )

  return { items }
})
