import type { Prisma } from '@prisma/client'
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

  // Build where clause with proper Prisma types
  const where: Prisma.EventWhereInput = {
    startsAt: {
      gte: startDate,
      ...(endDate && { lte: endDate }),
    },
    // Include PENDING events for now until we have a review workflow
    reviewStatus: { in: ['APPROVED', 'PENDING'] },
    isCancelled: false,
    // Always exclude private events
    eventType: { not: 'PRIVATE' },
    // Filter by music/non-music
    ...(musicOnly && { OR: [{ isMusic: true }, { isMusic: null }] }),
    // Filter by specific event type (overrides the PRIVATE exclusion if explicitly requested)
    ...(eventType && { eventType: eventType as Prisma.EnumEventTypeNullableFilter }),
    // Filter by region/venue
    ...(regionId && { regionId }),
    ...(venueId && { venueId }),
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
    const genresLower = genres.map(g => g.toLowerCase())
    filteredEvents = events.filter(event => {
      // Check canonicalGenres (from classifier) - case insensitive
      if (event.canonicalGenres?.some(g => genresLower.includes(g.toLowerCase()))) {
        return true
      }
      // Check event-level genres
      if (event.genres?.some(g => genresLower.includes(g.toLowerCase()))) {
        return true
      }
      // Fallback to artist genres
      return event.eventArtists.some(ea =>
        ea.artist.genres.some(g => genresLower.includes(g.toLowerCase()))
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
