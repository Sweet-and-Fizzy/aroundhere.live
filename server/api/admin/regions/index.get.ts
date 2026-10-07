import prisma from '../../../utils/prisma'

export default defineEventHandler(async () => {
  const regions = await prisma.region.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, slug: true, isActive: true,
      _count: { select: { venues: { where: { isActive: true } } } },
      towns: { orderBy: { townKey: 'asc' }, select: { id: true, townKey: true, city: true, state: true, source: true } },
    },
  })
  return {
    regions: regions.map(r => ({ id: r.id, name: r.name, slug: r.slug, isActive: r.isActive, venueCount: r._count.venues, towns: r.towns })),
  }
})
