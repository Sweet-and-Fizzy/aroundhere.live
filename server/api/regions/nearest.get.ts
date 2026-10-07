/**
 * Find the nearest region to a given lat/lng
 * GET /api/regions/nearest?lat=42.3&lng=-72.6
 */

import prisma from '../../utils/prisma'
import { findNearestRegion } from '../../utils/find-nearest-region'

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

  const result = await findNearestRegion(prisma, lat, lng)
  if (!result) {
    return { region: null, distance: null }
  }
  const { region, distance } = result
  return {
    region: {
      id: region.id,
      name: region.name,
      slug: region.slug,
      centroidLat: region.centroidLat,
      centroidLng: region.centroidLng,
    },
    distance: Math.round(distance * 10) / 10,
  }
})
