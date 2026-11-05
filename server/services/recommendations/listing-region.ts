import type { Prisma, PrismaClient } from '@prisma/client'
import { HOLDING_REGION_SLUG } from '../../utils/geo'

export type RegionSummary = { id: string; name: string; timezone: string }
export type ListingRegion = RegionSummary & { source: 'user' | 'activity' | 'fallback' }

const REGION_SUMMARY = { id: true, name: true, timezone: true } as const
const ELIGIBLE_REGION = { isActive: true, slug: { not: HOLDING_REGION_SLUG } }

/** Events that belong in the weekly listings, before region and date filters. */
export const listableEventWhere: Prisma.EventWhereInput = {
  isCancelled: false,
  reviewStatus: 'APPROVED',
  // Only include music events
  OR: [
    { isMusic: true },
    { isMusic: null, eventType: null }, // Unclassified, might be music
  ],
}

/** Most common region id, ties going to the lowest id so the result is stable. */
export function pickActivityRegion(regionIds: string[]): string | null {
  const counts = new Map<string, number>()
  for (const id of regionIds) counts.set(id, (counts.get(id) ?? 0) + 1)

  const [best] = [...counts].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
  return best?.[0] ?? null
}

export async function findBusiestRegion(prisma: PrismaClient, from: Date, to: Date): Promise<RegionSummary | null> {
  const [busiest] = await prisma.event.groupBy({
    by: ['regionId'],
    where: {
      ...listableEventWhere,
      startsAt: { gte: from, lte: to },
      region: ELIGIBLE_REGION,
    },
    orderBy: { _count: { regionId: 'desc' } },
    take: 1,
  })
  if (!busiest) return null

  return prisma.region.findUnique({ where: { id: busiest.regionId }, select: REGION_SUMMARY })
}

/**
 * The region whose listings a user's email shows. The result is for this email
 * only and is never saved, so a guess can't pass for the user's own choice.
 */
export async function resolveListingRegion(
  prisma: PrismaClient,
  user: { id: string; region: RegionSummary | null },
  fallback: RegionSummary | null,
  window: { from: Date; to: Date },
): Promise<ListingRegion | null> {
  if (user.region) return { ...user.region, source: 'user' }

  const [favorites, attendance] = await Promise.all([
    prisma.userFavoriteVenue.findMany({
      where: { userId: user.id, venue: { region: ELIGIBLE_REGION } },
      select: { venue: { select: { regionId: true } } },
    }),
    prisma.userEventAttendance.findMany({
      where: { userId: user.id, event: { region: ELIGIBLE_REGION } },
      select: { event: { select: { regionId: true } } },
    }),
  ])

  const activityRegionId = pickActivityRegion([
    ...favorites.map(f => f.venue.regionId),
    ...attendance.map(a => a.event.regionId),
  ])
  if (activityRegionId) {
    const upcoming = await prisma.event.count({
      where: { ...listableEventWhere, regionId: activityRegionId, startsAt: { gte: window.from, lte: window.to } },
    })
    const region = upcoming > 0
      ? await prisma.region.findUnique({ where: { id: activityRegionId }, select: REGION_SUMMARY })
      : null
    if (region) return { ...region, source: 'activity' }
  }

  return fallback ? { ...fallback, source: 'fallback' } : null
}
