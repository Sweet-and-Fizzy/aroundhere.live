import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { setCacheHeaders } from '../../utils/cache'
import { fromZonedTime } from 'date-fns-tz'
import { getUserProfile, findCandidateEvents, scoreEventsForUser } from '../../services/recommendations'
import { parseEventListQuery, eventFilterConditions } from '../../utils/event-query'

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

  // Look up region timezone if regionId is provided, so dates are whole days there
  const regionId = query.regionId as string | undefined
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

  const filters = parseEventListQuery(query, timezone)
  const { startDate, endDate } = filters
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0

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
  if (filters.regions?.length) {
    const regionRecords = await prisma.region.findMany({
      where: { slug: { in: filters.regions } },
      select: { id: true },
    })
    filters.regionIds = regionRecords.map(r => r.id)
  }

  const conditions = eventFilterConditions(filters)
  // Filter by user's attendance status
  if (myEvents && userId) {
    conditions.push({
      userAttendance: {
        some: {
          userId,
          ...(myEvents !== 'all' && {
            status: myEvents.toUpperCase() as 'INTERESTED' | 'GOING',
          }),
        },
      },
    })
  }
  const finalWhere: Prisma.EventWhereInput = { AND: conditions }

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
    // Get the start of the next day in the region's timezone
    // Convert event time to local date string, then get next day at midnight
    const localDateStr = lastEventDate.toLocaleDateString('en-CA', { timeZone: timezone })
    const [year, month, day] = localDateStr.split('-').map(Number)
    // Create next day at midnight in the region's timezone
    const nextDayLocal = new Date(year!, month! - 1, day! + 1)
    const nextDay = fromZonedTime(
      `${nextDayLocal.toISOString().split('T')[0]}T00:00:00`,
      timezone
    )

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
