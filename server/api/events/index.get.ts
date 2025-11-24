import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  // Parse query parameters
  const regionId = query.regionId as string | undefined
  const venueId = query.venueId as string | undefined
  const startDate = query.startDate ? new Date(query.startDate as string) : new Date()
  const endDate = query.endDate ? new Date(query.endDate as string) : undefined
  const genres = query.genres ? (query.genres as string).split(',') : undefined
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0

  // Classification filters
  // By default, only show music events (isMusic=true or null for unclassified)
  // Pass musicOnly=false to include non-music events
  const musicOnly = query.musicOnly !== 'false'
  const eventType = query.eventType as string | undefined

  // Build where clause
  const where: any = {
    startsAt: {
      gte: startDate,
      ...(endDate && { lte: endDate }),
    },
    // Include PENDING events for now until we have a review workflow
    reviewStatus: { in: ['APPROVED', 'PENDING'] },
    isCancelled: false,
  }

  // Filter by music/non-music
  if (musicOnly) {
    // Show music events and unclassified events (isMusic is true or null)
    where.OR = [{ isMusic: true }, { isMusic: null }]
  }

  // Filter by specific event type
  if (eventType) {
    where.eventType = eventType
  }

  if (regionId) {
    where.regionId = regionId
  }

  if (venueId) {
    where.venueId = venueId
  }

  // Fetch events with related data
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            latitude: true,
            longitude: true,
            logoUrl: true,
          },
        },
        eventArtists: {
          include: {
            artist: {
              select: {
                id: true,
                name: true,
                slug: true,
                genres: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
      orderBy: {
        startsAt: 'asc',
      },
      take: limit,
      skip: offset,
    }),
    prisma.event.count({ where }),
  ])

  // Filter by genre if specified (post-query filter for now)
  let filteredEvents = events
  if (genres && genres.length > 0) {
    filteredEvents = events.filter(event => {
      // Check event-level genres first
      if (event.genres?.some(g => genres.includes(g))) {
        return true
      }
      // Fallback to artist genres
      return event.eventArtists.some(ea =>
        ea.artist.genres.some(g => genres.includes(g))
      )
    })
  }

  return {
    events: filteredEvents,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  }
})
