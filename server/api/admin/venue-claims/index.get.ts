import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'MODERATOR') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const query = getQuery(event)
  const status = (query.status as string) || 'pending'
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  const where = status === 'pending'
    ? { verifiedAt: null }
    : status === 'approved'
      ? { verifiedAt: { not: null }, isActive: true }
      : { isActive: false, verifiedAt: { not: null } }

  const [items, total] = await Promise.all([
    prisma.venueModerator.findMany({
      where,
      select: {
        id: true,
        role: true,
        contactInfo: true,
        createdAt: true,
        verifiedAt: true,
        isActive: true,
        user: { select: { id: true, email: true, displayName: true } },
        venue: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.venueModerator.count({ where }),
  ])

  return {
    items,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    },
  }
})
