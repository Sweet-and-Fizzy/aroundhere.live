import prisma from '../../../utils/prisma'

export default defineEventHandler(async () => {
  // Get all venues
  const venues = await prisma.venue.findMany({
    include: {
      region: {
        select: { id: true, name: true },
      },
      _count: {
        select: {
          events: {
            where: {
              startsAt: { gte: new Date() },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Get all sources and match by venueId in config
  const sources = await prisma.source.findMany({
    where: {
      type: 'SCRAPER',
    },
    select: {
      id: true,
      name: true,
      config: true,
      lastRunAt: true,
      lastRunStatus: true,
      consecutiveFailures: true,
      isActive: true,
    },
  })

  // Create a map of venueId -> source
  const venueSourceMap = new Map<string, typeof sources[0]>()
  for (const source of sources) {
    const config = source.config as { venueId?: string } | null
    if (config?.venueId) {
      venueSourceMap.set(config.venueId, source)
    }
  }

  // Merge scraper status into venues
  const venuesWithScraperStatus = venues.map(venue => {
    const source = venueSourceMap.get(venue.id)
    return {
      ...venue,
      scraper: source ? {
        id: source.id,
        lastRunAt: source.lastRunAt,
        lastRunStatus: source.lastRunStatus,
        consecutiveFailures: source.consecutiveFailures,
        isActive: source.isActive,
      } : null,
    }
  })

  return { venues: venuesWithScraperStatus }
})
