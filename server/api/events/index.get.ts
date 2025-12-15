import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { setCacheHeaders } from '../../utils/cache'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const query = getQuery(event)

  // Parse query parameters
  const regionId = query.regionId as string | undefined
  // Support both single venueId and multiple venueIds
  const venueId = query.venueId as string | undefined
  const venueIds = query.venueIds ? (query.venueIds as string).split(',') : undefined
  const startDate = query.startDate ? new Date(query.startDate as string) : (() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })()
  // Set endDate to end of day (23:59:59.999 UTC) to include all events on that date
  const endDate = query.endDate ? (() => {
    const d = new Date(query.endDate as string)
    d.setUTCHours(23, 59, 59, 999)
    return d
  })() : undefined
  const genres = query.genres ? (query.genres as string).split(',') : undefined
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0

  // Geographic filters (filter by venue location)
  const state = query.state as string | undefined
  const city = query.city as string | undefined
  const cities = query.cities ? (query.cities as string).split(',') : undefined

  // Classification filters
  // By default, only show music events (isMusic=true or null for unclassified)
  // Pass musicOnly=false to include non-music events
  const musicOnly = query.musicOnly !== 'false'
  // Support both single eventType and multiple eventTypes
  const eventType = query.eventType as string | undefined
  const eventTypes = query.eventTypes ? (query.eventTypes as string).split(',') : undefined

  // Build where clause with proper Prisma types
  const where: Prisma.EventWhereInput = {
    startsAt: {
      gte: startDate,
      ...(endDate && { lte: endDate }),
    },
    // Include PENDING events for now until we have a review workflow
    reviewStatus: { in: ['APPROVED', 'PENDING'] },
    isCancelled: false,
    // Only show classified events (isMusic is set after classification)
    // This also excludes PRIVATE events since they get classified with eventType=PRIVATE
    isMusic: { not: null },
    ...(!eventType && !eventTypes && { eventType: { not: 'PRIVATE' as const } }),
    // Filter by music/non-music
    ...(musicOnly && { OR: [{ isMusic: true }, { isMusic: null }] }),
    // Filter by specific event type(s)
    ...(eventTypes && eventTypes.length > 0 && { eventType: { in: eventTypes as Prisma.EnumEventTypeNullableFilter['in'] } }),
    ...(eventType && !eventTypes && { eventType: eventType as Prisma.EnumEventTypeNullableFilter }),
    // Filter by region/venue(s)
    ...(regionId && { regionId }),
    ...(venueIds && venueIds.length > 0 && { venueId: { in: venueIds } }),
    ...(venueId && !venueIds && { venueId }),
    // Filter by genre - check canonicalGenres array (case-insensitive)
    ...(genres && genres.length > 0 && {
      canonicalGenres: { hasSome: genres.map(g => g.toLowerCase()) },
    }),
    // Filter by venue state/city
    ...(state && { venue: { state: { equals: state, mode: 'insensitive' } } }),
    ...(cities && cities.length > 0 && { venue: { city: { in: cities } } }),
    ...(city && !cities && { venue: { city: { contains: city, mode: 'insensitive' } } }),
  }

  // Fetch events with related data
  // First get the initial batch
  let events = await prisma.event.findMany({
    where,
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          state: true,
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
              spotifyId: true,
              spotifyMatchStatus: true,
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
  })

  // Hybrid pagination: Don't cut off mid-day
  // If we have events and haven't hit the max, extend to include all events from the last day
  if (events.length > 0 && events.length < 100) {
    const lastEvent = events[events.length - 1]
    const lastEventDate = new Date(lastEvent.startsAt)
    // Get the start of the next day
    const nextDay = new Date(lastEventDate)
    nextDay.setHours(0, 0, 0, 0)
    nextDay.setDate(nextDay.getDate() + 1)

    // Fetch any additional events from the same day
    const sameDayEvents = await prisma.event.findMany({
      where: {
        ...where,
        startsAt: {
          gte: lastEventDate,
          lt: nextDay,
        },
        id: {
          notIn: events.map(e => e.id),
        },
      },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            state: true,
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
                spotifyId: true,
                spotifyMatchStatus: true,
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
      // Cap total at 100 to prevent huge pages
      take: Math.max(0, 100 - events.length),
    })

    events = [...events, ...sameDayEvents]
  }

  const total = await prisma.event.count({ where })

  return {
    events,
    pagination: {
      total,
      limit: events.length, // Return actual number of events returned
      offset,
      hasMore: offset + events.length < total,
    },
  }
})
