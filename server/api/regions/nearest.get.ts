/**
 * Find the nearest region to a given lat/lng
 * GET /api/regions/nearest?lat=42.3&lng=-72.6
 */

import prisma from '../../utils/prisma'
import { haversineDistance } from '../../services/clustering'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const lat = parseFloat(query.lat as string)
  const lng = parseFloat(query.lng as string)

  if (isNaN(lat) || isNaN(lng)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'lat and lng query parameters are required',
    })
  }

  // Get all active regions with centroids
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
      centroidLat: true,
      centroidLng: true,
    },
  })

  if (regions.length === 0) {
    // Fallback: return the first active region (legacy behavior)
    const fallback = await prisma.region.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    })

    return {
      region: fallback,
      distance: null,
    }
  }

  // Find nearest region by distance to centroid
  let nearestRegion = regions[0]!
  let nearestDistance = haversineDistance(
    lat, lng,
    nearestRegion.centroidLat!, nearestRegion.centroidLng!
  )

  for (const region of regions.slice(1)) {
    const distance = haversineDistance(
      lat, lng,
      region.centroidLat!, region.centroidLng!
    )

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestRegion = region
    }
  }

  return {
    region: {
      id: nearestRegion.id,
      name: nearestRegion.name,
      slug: nearestRegion.slug,
      centroidLat: nearestRegion.centroidLat,
      centroidLng: nearestRegion.centroidLng,
    },
    distance: Math.round(nearestDistance * 10) / 10, // miles, rounded to 1 decimal
  }
})
