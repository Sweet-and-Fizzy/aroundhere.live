import { prisma } from '../../../utils/prisma'
import type { ReviewStatus } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user?.role || !['ADMIN', 'MODERATOR'].includes(session.user.role as string)) {
    throw createError({ statusCode: 403, message: 'Admin access required' })
  }

  const query = getQuery(event)
  const status = (query.status as string) || 'PENDING'
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0

  const where = {
    submittedById: { not: null },
    ...(status !== 'all' && { reviewStatus: status as ReviewStatus }),
  }

  const [items, total] = await Promise.all([
    prisma.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        startsAt: true,
        reviewStatus: true,
        createdAt: true,
        coverCharge: true,
        locationName: true,
        locationAddress: true,
        locationCity: true,
        venue: {
          select: { id: true, name: true, slug: true },
        },
        submittedBy: {
          select: { id: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.event.count({ where }),
  ])

  return {
    items,
    pagination: { total, limit, offset, hasMore: offset + items.length < total },
  }
})
