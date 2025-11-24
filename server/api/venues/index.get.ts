import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const regionId = query.regionId as string | undefined
  const venueType = query.venueType as string | undefined
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0

  const where: any = {
    isActive: true,
  }

  if (regionId) {
    where.regionId = regionId
  }

  if (venueType) {
    where.venueType = venueType
  }

  const [venues, total] = await Promise.all([
    prisma.venue.findMany({
      where,
      include: {
        region: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            events: {
              where: {
                startsAt: { gte: new Date() },
                reviewStatus: 'APPROVED',
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      take: limit,
      skip: offset,
    }),
    prisma.venue.count({ where }),
  ])

  return {
    venues,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  }
})
