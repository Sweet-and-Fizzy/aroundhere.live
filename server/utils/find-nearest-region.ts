import type { PrismaClient } from '@prisma/client'

/**
 * Calculate haversine distance between two points in miles
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Find the nearest active region to a given lat/lng coordinate
 * Uses haversine distance to each region's centroid
 */
export async function findNearestRegion(
  prisma: PrismaClient,
  lat: number,
  lng: number
) {
  const regions = await prisma.region.findMany({
    where: {
      isActive: true,
      centroidLat: { not: null },
      centroidLng: { not: null },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      centroidLat: true,
      centroidLng: true,
    },
  })

  if (regions.length === 0) {
    throw new Error('No active regions with centroids found')
  }

  let nearest = regions[0]!
  let minDistance = Infinity

  for (const region of regions) {
    if (region.centroidLat == null || region.centroidLng == null) continue
    const distance = haversineDistance(lat, lng, region.centroidLat, region.centroidLng)
    if (distance < minDistance) {
      minDistance = distance
      nearest = region
    }
  }

  return nearest
}
