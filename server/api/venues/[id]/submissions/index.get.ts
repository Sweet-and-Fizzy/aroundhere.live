import prisma from '../../../../utils/prisma'
import { isVenueModerator } from '../../../../utils/venue-moderator'
import type { ReviewStatus } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const venueId = getRouterParam(event, 'id')
  if (!venueId) {
    throw createError({ statusCode: 400, statusMessage: 'Venue ID is required' })
  }

  const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'MODERATOR'
  const isModerator = await isVenueModerator(prisma, userId, venueId)

  if (!isAdmin && !isModerator) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied' })
  }

  const query = getQuery(event)
  const status = (query.status as string) || 'PENDING'

  const items = await prisma.event.findMany({
    where: {
      venueId,
      submittedById: { not: null },
      reviewStatus: status as ReviewStatus,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      reviewStatus: true,
      createdAt: true,
      submittedBy: { select: { email: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return { items }
})
