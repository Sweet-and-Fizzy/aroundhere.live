import { getRequestIP, type H3Event } from 'h3'
import type { PrismaClient } from '@prisma/client'
import { getLocationFromIp } from '../services/ip-geolocation'
import { findNearestRegion } from './find-nearest-region'

const MAX_AUTO_REGION_MILES = 100

/**
 * Give a user with no region the nearest one to their IP. Never throws, so a
 * geolocation problem can't fail a login. Returns the user's region id, if any.
 */
export async function assignRegionFromRequest(
  prisma: PrismaClient,
  event: H3Event,
  user: { id: string; regionId: string | null },
): Promise<string | null> {
  if (user.regionId) return user.regionId

  try {
    const ip = getRequestIP(event, { xForwardedFor: true })
    if (!ip) return null

    const location = await getLocationFromIp(ip)
    if (!location) return null

    const nearest = await findNearestRegion(prisma, location.lat, location.lng)
    if (!nearest || nearest.distance > MAX_AUTO_REGION_MILES) return null

    await prisma.user.update({
      where: { id: user.id },
      data: { regionId: nearest.region.id },
    })
    return nearest.region.id
  } catch (error) {
    // Don't fail login if geolocation fails
    console.error('Failed to set default region from IP:', error)
    return null
  }
}
