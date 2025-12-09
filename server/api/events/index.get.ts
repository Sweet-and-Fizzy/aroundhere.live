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
  const startDate = query.startDate ? new Date(query.startDate as string) : new Date()
  const endDate = query.endDate ? new Date(query.endDate as string) : undefined
  const genres = query.genres ? (query.genres as string).split(',') : undefined
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0

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
    // Always exclude private events (unless explicitly requesting a type)
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
    }),
    prisma.event.count({ where }),
  ])

  return {
    events,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  }
})
