import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { setCacheHeaders } from '../../utils/cache'
import { fromZonedTime } from 'date-fns-tz'
import { getUserProfile, findCandidateEvents, scoreEventsForUser } from '../../services/recommendations'

const DEFAULT_TIMEZONE = 'America/New_York'

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

  // Look up region timezone if regionId is provided
  let timezone = DEFAULT_TIMEZONE
  if (regionId) {
    const region = await prisma.region.findUnique({
      where: { id: regionId },
      select: { timezone: true },
    })
    if (region?.timezone) {
      timezone = region.timezone
    }
  }

  // Parse date strings as local dates in the region's timezone
  // This ensures "today" means today in the region's time, not UTC
  const startDate = query.startDate
    ? fromZonedTime(`${query.startDate}T00:00:00`, timezone)
    : (() => {
        // Get current date in region's timezone
        const now = new Date()
        const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone }) // YYYY-MM-DD format
        return fromZonedTime(`${localDate}T00:00:00`, timezone)
      })()
  // Set endDate to end of day in region's timezone to include all events on that date
  const endDate = query.endDate
    ? fromZonedTime(`${query.endDate}T23:59:59.999`, timezone)
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
  // Pass nonMusicOnly=true to show only non-music events
  const musicOnly = query.musicOnly !== 'false'
  const nonMusicOnly = query.nonMusicOnly === 'true'
  // Support both single eventType and multiple eventTypes
  const eventType = query.eventType as string | undefined
  const eventTypes = query.eventTypes ? (query.eventTypes as string).split(',') : undefined

  console.log('[Events API] myEvents filter:', myEvents, 'userId:', userId)

  // Handle "recommended" filter - uses recommendation service instead of direct query
  if (myEvents === 'recommended' && userId) {
    const userProfile = await getUserProfile(userId)
    if (!userProfile) {
      console.log('[Events API] No user profile found for recommendations')
      return { events: [], pagination: { total: 0, limit, offset, hasMore: false } }
    }

    // Minimum score threshold for browsing recommendations
    const minScoreThreshold = 0.15

    // Calculate end date for recommendations (default 30 days if not specified)
    const recommendEndDate = endDate || new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Find candidate events (respects date range and region)
    const candidateEvents = await findCandidateEvents(
      startDate,
      recommendEndDate,
      [], // no excluded events
      100, // limit (not really used)
      userProfile.regionId
    )

    console.log('[Events API] Found', candidateEvents.length, 'candidate events for recommendations')

    // Score events against user profile
    const scoredEvents = await scoreEventsForUser(candidateEvents, userProfile)

    console.log('[Events API] Scored', scoredEvents.length, 'events')

    // Filter by score threshold and sort by date (for consistency with home page)
    const recommended = scoredEvents
      .filter(e => e.score >= minScoreThreshold)
      .sort((a, b) => new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime())

    console.log('[Events API] After filtering by score:', recommended.length, 'events')

    // Apply pagination
    const paginatedEvents = recommended.slice(offset, offset + limit)

    // Map to the expected format with recommendation reasons
    // Include all fields that the Event type expects
    const events = paginatedEvents.map(r => ({
      id: r.event.id,
      title: r.event.title,
      slug: r.event.slug,
      startsAt: r.event.startsAt,
      coverCharge: r.event.coverCharge,
      canonicalGenres: r.event.canonicalGenres,
      eventType: r.event.eventType,
      imageUrl: r.event.imageUrl,
      summary: r.event.summary,
      ageRestriction: 'ALL_AGES', // Default since we don't have this in scored events
      venue: r.event.venue,
      eventArtists: r.event.artists.map(a => ({ artist: a })),
      recommendationReasons: r.reasons,
      recommendationScore: Math.round(r.score * 100), // Convert to 0-100 scale to match interests page
    }))

    // Log score distribution for debugging
    const allScores = recommended.map(e => Math.round(e.score * 100))
    const maxScore = Math.max(...allScores)
    const returnedScores = events.map(e => e.recommendationScore).slice(0, 10)
    console.log('[Events API] Returning', events.length, 'of', recommended.length, 'recommended events. Max score:', maxScore, 'First 10 returned:', returnedScores)

    return {
      events,
      pagination: {
        total: recommended.length,
        limit: events.length,
        offset,
        hasMore: offset + events.length < recommended.length,
      },
    }
  }

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
    // musicOnly=true (default): only isMusic=true
    // nonMusicOnly=true: only isMusic=false (non-music events)
    // musicOnly=false: show all classified events (music AND non-music)
    // If specific event types are requested, don't filter by isMusic
    ...(!eventType && !eventTypes && nonMusicOnly && {
      isMusic: false,
      // Exclude PRIVATE events, but allow null eventType
      OR: [
        { eventType: { not: 'PRIVATE' as const } },
        { eventType: null }
      ]
    }),
    ...(!eventType && !eventTypes && musicOnly && !nonMusicOnly && {
      isMusic: true,
      // Exclude PRIVATE events, but allow null eventType
      OR: [
        { eventType: { not: 'PRIVATE' as const } },
        { eventType: null }
      ]
    }),
    ...(!eventType && !eventTypes && !musicOnly && !nonMusicOnly && {
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
