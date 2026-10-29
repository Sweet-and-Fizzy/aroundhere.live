import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { setCacheHeaders } from '../../utils/cache'
import { parseEventListQuery, eventFilterConditions, type EventFacet } from '../../utils/event-query'

const DEFAULT_TIMEZONE = 'America/New_York'

/**
 * Get faceted counts for event filters
 * Returns counts for each filter option based on current filter state
 */
export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const query = getQuery(event)

  // Same filters as the events list, so the counts match what each option shows
  const filters = parseEventListQuery(query, DEFAULT_TIMEZONE)
  if (filters.regions?.length) {
    const regionRecords = await prisma.region.findMany({
      where: { slug: { in: filters.regions } },
      select: { id: true },
    })
    filters.regionIds = regionRecords.map(r => r.id)
  }

  const q = (query.q as string)?.trim()

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

  // Every filter except the one being counted
  function whereWithout(facet: EventFacet): Prisma.EventWhereInput {
    const conditions = eventFilterConditions(filters, facet)
    if (textSearchCondition) conditions.push(textSearchCondition)
    return { AND: conditions }
  }

  // Get venue counts (without venue filter applied)
  const venueCountsRaw = await prisma.event.groupBy({
    by: ['venueId'],
    where: whereWithout('venue'),
    _count: { id: true },
  })

  const venueCounts: Record<string, number> = {}
  for (const vc of venueCountsRaw) {
    if (vc.venueId) {
      venueCounts[vc.venueId] = vc._count.id
    }
  }

  // Get genre counts (without genre filter applied)
  const genreWhereClause = whereWithout('genre')

  // For genres, use PostgreSQL unnest to count array elements efficiently
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

  // Get event type counts (without the music/type filter applied)
  const typeWhere = whereWithout('type')

  const typeCountsRaw = await prisma.event.groupBy({
    by: ['eventType'],
    where: typeWhere,
    _count: { id: true },
  })

  const typeCounts: Record<string, number> = {}
  for (const tc of typeCountsRaw) {
    if (tc.eventType) {
      typeCounts[tc.eventType] = tc._count.id
    }
  }

  // Count music vs non-music
  const musicCount = await prisma.event.count({
    where: { AND: [typeWhere, { isMusic: true }] },
  })

  const nonMusicCount = await prisma.event.count({
    where: { AND: [typeWhere, { isMusic: false }] },
  })

  // Get city counts (without the city or region filter applied)
  // Get city counts using raw SQL with proper JOINs for efficiency
  const cityMatchingEventIds = await prisma.event.findMany({
    where: whereWithout('city'),
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
