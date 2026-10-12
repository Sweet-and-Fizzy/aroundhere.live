import type { PrismaClient } from '@prisma/client'
import { HOLDING_REGION_SLUG, nearestRegion } from './geo'

/** Nearest active, non-holding region by centroid. Null if none have centroids. */
export async function findNearestRegion(prisma: PrismaClient, lat: number, lng: number) {
  const regions = await prisma.region.findMany({
    where: {
      isActive: true,
      slug: { not: HOLDING_REGION_SLUG },
      centroidLat: { not: null },
      centroidLng: { not: null },
    },
    select: { id: true, name: true, slug: true, timezone: true, centroidLat: true, centroidLng: true },
  })
  const points = regions.map(r => ({ ...r, centroidLat: r.centroidLat!, centroidLng: r.centroidLng! }))
  return nearestRegion(points, lat, lng)
}
