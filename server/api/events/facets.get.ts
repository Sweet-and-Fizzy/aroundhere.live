import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { setCacheHeaders } from '../../utils/cache'

/**
 * Get faceted counts for event filters
 * Returns counts for each filter option based on current filter state
 */
export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const query = getQuery(event)

  // Parse current filter parameters
  const q = (query.q as string)?.trim()
  // Parse date strings as local dates (YYYY-MM-DD format)
  // Appending T00:00:00 ensures the date is parsed as local time, not UTC
  const startDate = query.startDate
    ? new Date(`${query.startDate}T00:00:00`)
    : new Date()
  const endDate = query.endDate
    ? new Date(`${query.endDate}T23:59:59.999`)
    : undefined
  const venueIds = query.venueIds ? (query.venueIds as string).split(',') : undefined
  const genres = query.genres ? (query.genres as string).split(',') : undefined
  const eventTypes = query.eventTypes ? (query.eventTypes as string).split(',') : undefined
  const cities = query.cities ? (query.cities as string).split(',') : undefined
  const musicOnly = query.musicOnly !== 'false'

  // Text search condition (same as search API)
  const textSearchCondition: Prisma.EventWhereInput | undefined = q
    ? {
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
    : undefined

  // Base where clause without the facet being counted
  const baseWhere: Prisma.EventWhereInput = {
    startsAt: {
      gte: startDate,
      ...(endDate && { lte: endDate }),
    },
    reviewStatus: { in: ['APPROVED', 'PENDING'] },
    isCancelled: false,
    ...textSearchCondition,
  }

  // Helper to build where clause with proper AND combination (to avoid OR conflicts)
  function buildWhereClause(additionalConditions: Prisma.EventWhereInput[]): Prisma.EventWhereInput {
    const conditions = [baseWhere, ...additionalConditions]
    return conditions.length === 1 ? conditions[0]! : { AND: conditions }
  }

  // Music filter condition (used in multiple places)
  // Only include classified events (exclude isMusic: null)
  const musicCondition: Prisma.EventWhereInput = { isMusic: true }

  // Get venue counts (without venue filter applied)
  const venueConditions: Prisma.EventWhereInput[] = []
  if (musicOnly) venueConditions.push(musicCondition)
  if (eventTypes && eventTypes.length > 0) {
    venueConditions.push({ eventType: { in: eventTypes as Prisma.EnumEventTypeNullableFilter['in'] } })
  }
  if (genres && genres.length > 0) {
    venueConditions.push({ canonicalGenres: { hasSome: genres.map(g => g.toLowerCase()) } })
  }
  if (cities && cities.length > 0) {
    venueConditions.push({ venue: { city: { in: cities } } })
  }

  const venueCountsRaw = await prisma.event.groupBy({
    by: ['venueId'],
    where: buildWhereClause(venueConditions),
    _count: { id: true },
  })

  const venueCounts: Record<string, number> = {}
  for (const vc of venueCountsRaw) {
    if (vc.venueId) {
      venueCounts[vc.venueId] = vc._count.id
    }
  }

  // Get genre counts (without genre filter applied)
  const genreConditions: Prisma.EventWhereInput[] = []
  if (musicOnly) genreConditions.push(musicCondition)
  if (eventTypes && eventTypes.length > 0) {
    genreConditions.push({ eventType: { in: eventTypes as Prisma.EnumEventTypeNullableFilter['in'] } })
  }
  if (venueIds && venueIds.length > 0) {
    genreConditions.push({ venueId: { in: venueIds } })
  }
  if (cities && cities.length > 0) {
    genreConditions.push({ venue: { city: { in: cities } } })
  }

  // For genres, use PostgreSQL unnest to count array elements efficiently
  // Build the WHERE clause conditions for raw SQL
  const genreWhereClause = buildWhereClause(genreConditions)

  // Use Prisma's findMany to get IDs matching the filter, then use raw SQL to count genres
  const matchingEventIds = await prisma.event.findMany({
    where: genreWhereClause,
    select: { id: true },
  })

  const genreCounts: Record<string, number> = {}
  if (matchingEventIds.length > 0) {
    const eventIds = matchingEventIds.map(e => e.id)
    const genreCountsRaw = await prisma.$queryRaw<Array<{ genre: string; count: bigint }>>`
      SELECT unnest("canonicalGenres") as genre, count(*) as count
      FROM events
      WHERE id = ANY(${eventIds})
      GROUP BY genre
    `
    for (const gc of genreCountsRaw) {
      genreCounts[gc.genre] = Number(gc.count)
    }
  }

  // Get event type counts (without eventType filter applied)
  const typeConditions: Prisma.EventWhereInput[] = []
  if (venueIds && venueIds.length > 0) {
    typeConditions.push({ venueId: { in: venueIds } })
  }
  if (genres && genres.length > 0) {
    typeConditions.push({ canonicalGenres: { hasSome: genres.map(g => g.toLowerCase()) } })
  }
  if (cities && cities.length > 0) {
    typeConditions.push({ venue: { city: { in: cities } } })
  }
  const typeWhereForTypes = buildWhereClause(typeConditions)

  const typeCountsRaw = await prisma.event.groupBy({
    by: ['eventType'],
    where: typeWhereForTypes,
    _count: { id: true },
  })

  const typeCounts: Record<string, number> = {}
  for (const tc of typeCountsRaw) {
    if (tc.eventType) {
      typeCounts[tc.eventType] = tc._count.id
    }
  }

  // Count music vs non-music (use AND to properly combine with search)
  const musicCount = await prisma.event.count({
    where: buildWhereClause([...typeConditions, musicCondition]),
  })

  const nonMusicCount = await prisma.event.count({
    where: buildWhereClause([...typeConditions, { isMusic: false }]),
  })

  // Get city counts (without city filter applied)
  // We need to fetch events with venues and count by city manually
  const cityConditions: Prisma.EventWhereInput[] = []
  if (musicOnly) cityConditions.push(musicCondition)
  if (eventTypes && eventTypes.length > 0) {
    cityConditions.push({ eventType: { in: eventTypes as Prisma.EnumEventTypeNullableFilter['in'] } })
  }
  if (venueIds && venueIds.length > 0) {
    cityConditions.push({ venueId: { in: venueIds } })
  }
  if (genres && genres.length > 0) {
    cityConditions.push({ canonicalGenres: { hasSome: genres.map(g => g.toLowerCase()) } })
  }

  // Get city counts using raw SQL with proper JOINs for efficiency
  const cityMatchingEventIds = await prisma.event.findMany({
    where: buildWhereClause(cityConditions),
    select: { id: true },
  })

  const cityCounts: Record<string, number> = {}
  const cityRegions: Record<string, string> = {} // Map city -> region slug
  const regionNames: Record<string, string> = {} // Map region slug -> region name

  if (cityMatchingEventIds.length > 0) {
    const eventIds = cityMatchingEventIds.map(e => e.id)
    const cityCountsRaw = await prisma.$queryRaw<Array<{
      city: string | null
      region_slug: string | null
      region_name: string | null
      count: bigint
    }>>`
      SELECT v.city, r.slug as region_slug, r.name as region_name, count(*) as count
      FROM events e
      JOIN venues v ON e."venueId" = v.id
      LEFT JOIN regions r ON v."regionId" = r.id
      WHERE e.id = ANY(${eventIds}) AND v.city IS NOT NULL
      GROUP BY v.city, r.slug, r.name
    `
    for (const cc of cityCountsRaw) {
      if (cc.city) {
        cityCounts[cc.city] = Number(cc.count)
        if (cc.region_slug && !cityRegions[cc.city]) {
          cityRegions[cc.city] = cc.region_slug
        }
        if (cc.region_slug && cc.region_name && !regionNames[cc.region_slug]) {
          regionNames[cc.region_slug] = cc.region_name
        }
      }
    }
  }

  return {
    venueCounts,
    genreCounts,
    typeCounts,
    cityCounts,
    cityRegions,
    regionNames,
    musicCount,
    nonMusicCount,
  }
})
