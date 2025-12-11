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
  const startDate = query.startDate ? new Date(query.startDate as string) : new Date()
  const endDate = query.endDate ? new Date(query.endDate as string) : undefined
  const venueIds = query.venueIds ? (query.venueIds as string).split(',') : undefined
  const genres = query.genres ? (query.genres as string).split(',') : undefined
  const eventTypes = query.eventTypes ? (query.eventTypes as string).split(',') : undefined
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
  const musicCondition: Prisma.EventWhereInput = { OR: [{ isMusic: true }, { isMusic: null }] }

  // Get venue counts (without venue filter applied)
  const venueConditions: Prisma.EventWhereInput[] = []
  if (musicOnly) venueConditions.push(musicCondition)
  if (eventTypes && eventTypes.length > 0) {
    venueConditions.push({ eventType: { in: eventTypes as Prisma.EnumEventTypeNullableFilter['in'] } })
  }
  if (genres && genres.length > 0) {
    venueConditions.push({ canonicalGenres: { hasSome: genres.map(g => g.toLowerCase()) } })
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

  // For genres, we need to fetch events and count genres manually since they're arrays
  const eventsWithGenres = await prisma.event.findMany({
    where: buildWhereClause(genreConditions),
    select: { canonicalGenres: true },
  })

  const genreCounts: Record<string, number> = {}
  for (const e of eventsWithGenres) {
    for (const genre of e.canonicalGenres) {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1
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

  return {
    venueCounts,
    genreCounts,
    typeCounts,
    musicCount,
    nonMusicCount,
  }
})
