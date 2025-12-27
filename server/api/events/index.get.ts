import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { setCacheHeaders } from '../../utils/cache'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  // Get user session for "My Events" filter
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined

  // My Events filter - filter by user's attendance status
  const myEvents = query.myEvents as string | undefined

  // Only cache if not using user-specific filters
  if (!myEvents) {
    setCacheHeaders(event)
  }

  // Parse query parameters
  const regionId = query.regionId as string | undefined
  const regions = query.regions ? (query.regions as string).split(',') : undefined
  // Support both single venueId and multiple venueIds
  const venueId = query.venueId as string | undefined
  const venueIds = query.venueIds ? (query.venueIds as string).split(',') : undefined

  // Favorites filters
  const favoriteArtistIds = query.favoriteArtistIds ? (query.favoriteArtistIds as string).split(',') : undefined
  const favoriteVenueIds = query.favoriteVenueIds ? (query.favoriteVenueIds as string).split(',') : undefined
  const favoriteGenres = query.favoriteGenres ? (query.favoriteGenres as string).split(',') : undefined
  // Parse date strings as local dates (YYYY-MM-DD format)
  // Appending T00:00:00 ensures the date is parsed as local time, not UTC
  const startDate = query.startDate
    ? new Date(`${query.startDate}T00:00:00`)
    : (() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return today
      })()
  // Set endDate to end of day to include all events on that date
  const endDate = query.endDate
    ? (() => {
        const d = new Date(`${query.endDate}T23:59:59.999`)
        return d
      })()
    : undefined
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

  console.log('[Events API] myEvents filter:', myEvents, 'userId:', userId)

  // If regions are specified, look up region IDs from region slugs
  let regionIds: string[] | undefined
  if (regions && regions.length > 0) {
    const regionRecords = await prisma.region.findMany({
      where: {
        slug: {
          in: regions,
        }
      },
      select: { id: true },
    })
    regionIds = regionRecords.map(r => r.id)
  }

  // Build where clause with proper Prisma types
  const where: Prisma.EventWhereInput = {
    startsAt: {
      gte: startDate,
      ...(endDate && { lte: endDate }),
    },
    // Include PENDING events for now until we have a review workflow
    reviewStatus: { in: ['APPROVED', 'PENDING'] },
    isCancelled: false,
    // Filter by music/non-music
    // musicOnly=true (default): only isMusic=true (exclude unclassified)
    // musicOnly=false: show all classified events (music AND non-music)
    // If specific event types are requested, don't filter by isMusic
    ...(!eventType && !eventTypes && musicOnly && {
      isMusic: true,
      // Exclude PRIVATE events, but allow null eventType
      OR: [
        { eventType: { not: 'PRIVATE' as const } },
        { eventType: null }
      ]
    }),
    ...(!eventType && !eventTypes && !musicOnly && {
      isMusic: { not: null }, // Only show classified events
      OR: [
        { eventType: { not: 'PRIVATE' as const } },
        { eventType: null }
      ]
    }),
    // Filter by specific event type(s)
    ...(eventTypes && eventTypes.length > 0 && { eventType: { in: eventTypes as Prisma.EnumEventTypeNullableFilter['in'] } }),
    ...(eventType && !eventTypes && { eventType: eventType as Prisma.EnumEventTypeNullableFilter }),
    // Filter by region/venue(s)
    ...(regionIds && regionIds.length > 0 && { regionId: { in: regionIds } }),
    ...(regionId && !regionIds && { regionId }),
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
    // Filter by user's attendance status
    ...(myEvents && userId && {
      userAttendance: {
        some: {
          userId,
          ...(myEvents !== 'all' && {
            status: myEvents.toUpperCase() as 'INTERESTED' | 'GOING',
          }),
        },
      },
    }),
  }

  // Add favorites filters with OR logic (show events matching ANY favorite type)
  const favoriteConditions: Prisma.EventWhereInput[] = []

  if (favoriteArtistIds && favoriteArtistIds.length > 0) {
    favoriteConditions.push({
      eventArtists: {
        some: {
          artistId: { in: favoriteArtistIds },
        },
      },
    })
  }

  if (favoriteVenueIds && favoriteVenueIds.length > 0) {
    favoriteConditions.push({
      venueId: { in: favoriteVenueIds },
    })
  }

  if (favoriteGenres && favoriteGenres.length > 0) {
    favoriteConditions.push({
      canonicalGenres: { hasSome: favoriteGenres.map(g => g.toLowerCase()) },
    })
  }

  // Combine base where with favorites (using OR for favorites)
  const finalWhere: Prisma.EventWhereInput = favoriteConditions.length > 0
    ? {
        AND: [
          where,
          { OR: favoriteConditions },
        ],
      }
    : where

  // Fetch events with related data
  // First get the initial batch
  let events = await prisma.event.findMany({
    where: finalWhere,
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
          region: {
            select: {
              timezone: true,
            },
          },
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
    if (!lastEvent) throw createError({ statusCode: 500, message: 'No last event found' })
    const lastEventDate = new Date(lastEvent.startsAt)
    // Get the start of the next day
    const nextDay = new Date(lastEventDate)
    nextDay.setHours(0, 0, 0, 0)
    nextDay.setDate(nextDay.getDate() + 1)

    // Fetch any additional events from the same day
    const sameDayEvents = await prisma.event.findMany({
      where: {
        ...finalWhere,
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
            region: {
              select: {
                timezone: true,
              },
            },
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

  const total = await prisma.event.count({ where: finalWhere })

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
