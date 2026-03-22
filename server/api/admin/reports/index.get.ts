import { prisma } from '../../../utils/prisma'
import type { EventReportStatus } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user?.role || !['ADMIN', 'MODERATOR'].includes(session.user.role as string)) {
    throw createError({ statusCode: 403, message: 'Admin access required' })
  }

  const query = getQuery(event)
  const status = (query.status as string) || 'OPEN'
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0

  const where = {
    ...(status !== 'all' && { status: status as EventReportStatus }),
  }

  const [items, total] = await Promise.all([
    prisma.eventReport.findMany({
      where,
      include: {
        event: {
          select: { id: true, title: true, slug: true },
        },
        user: {
          select: { id: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.eventReport.count({ where }),
  ])

  return {
    items,
    pagination: { total, limit, offset, hasMore: offset + items.length < total },
  }
})
