import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const q = (query.q as string)?.trim()
  const regionId = query.regionId as string | undefined
  const regions = query.regions ? (query.regions as string).split(',') : undefined
  const cities = query.cities ? (query.cities as string).split(',') : undefined
  // Parse date strings as local dates (YYYY-MM-DD format)
  // Appending T00:00:00 ensures the date is parsed as local time, not UTC
  const startDate = query.startDate
    ? new Date(`${query.startDate}T00:00:00`)
    : new Date()
  // Set endDate to end of day to include all events on that date
  const endDate = query.endDate
    ? new Date(`${query.endDate}T23:59:59.999`)
    : undefined
  const genres = query.genres ? (query.genres as string).split(',') : undefined
  const venueId = query.venueId as string | undefined
  const venueIds = query.venueIds ? (query.venueIds as string).split(',') : undefined
  const eventTypes = query.eventTypes ? (query.eventTypes as string).split(',') : undefined
  const musicOnly = query.musicOnly !== 'false'
  const limit = Math.min(parseInt(query.limit as string) || 20, 50)

  if (!q) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Search query required',
    })
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

  // Base where clause (date range, status, text search)
  const baseWhere: Prisma.EventWhereInput = {
    startsAt: {
      gte: startDate,
      ...(endDate && { lte: endDate }),
    },
    reviewStatus: { in: ['APPROVED', 'PENDING'] },
    isCancelled: false,
    // Text search - match title, description, venue name, or artist name
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      {
        venue: {
          name: { contains: q, mode: 'insensitive' },
        },
      },
      {
        eventArtists: {
          some: {
            artist: {
              name: { contains: q, mode: 'insensitive' },
            },
          },
        },
      },
    ],
  }

  if (regionIds && regionIds.length > 0) {
    baseWhere.regionId = { in: regionIds }
  } else if (regionId) {
    baseWhere.regionId = regionId
  }

  // Build filtered where clause (with all user filters applied)
  // Use AND to combine base conditions with additional filters
  const filterConditions: Prisma.EventWhereInput[] = []

  if (venueId) {
    filterConditions.push({ venueId })
  }

  if (venueIds && venueIds.length > 0) {
    filterConditions.push({ venueId: { in: venueIds } })
  }

  if (cities && cities.length > 0) {
    filterConditions.push({ venue: { city: { in: cities } } })
  }

  if (genres && genres.length > 0) {
    filterConditions.push({ canonicalGenres: { hasSome: genres.map(g => g.toLowerCase()) } })
  }

  if (eventTypes && eventTypes.length > 0) {
    filterConditions.push({ eventType: { in: eventTypes as Prisma.EnumEventTypeNullableFilter['in'] } })
  }

  if (musicOnly) {
    filterConditions.push({
      OR: [
        { isMusic: true },
        { isMusic: null },
      ],
    })
  }

  const filteredWhere: Prisma.EventWhereInput = filterConditions.length > 0
    ? { AND: [baseWhere, ...filterConditions] }
    : baseWhere

  // Run queries in parallel: filtered events, total count (without filters), artists, venues
  const [events, totalCount, artists, venues] = await Promise.all([
    // Filtered events
    prisma.event.findMany({
      where: filteredWhere,
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
    }),

    // Total count without user filters (just text search + date range)
    prisma.event.count({
      where: baseWhere,
    }),

    // Search artists
    prisma.artist.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
      },
      take: 5,
    }),

    // Search venues
    prisma.venue.findMany({
      where: {
        isActive: true,
        ...(regionId && { regionId }),
        name: { contains: q, mode: 'insensitive' },
      },
      take: 5,
    }),
  ])

  return {
    events,
    artists,
    venues,
    filteredCount: events.length,
    totalCount,
  }
})
