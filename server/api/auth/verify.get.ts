import { prisma } from '../../utils/prisma'
import { getRequestIP } from 'h3'
import { getLocationFromIp } from '../../services/ip-geolocation'
import { haversineDistance } from '../../services/clustering'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Token is required',
    })
  }

  try {
    // Find the login token
    const loginToken = await prisma.loginToken.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!loginToken) {
      throw createError({
        statusCode: 401,
        message: 'Invalid or expired token',
      })
    }

    // Check if token has expired
    if (loginToken.expiresAt < new Date()) {
      // Delete expired token
      await prisma.loginToken.delete({
        where: { id: loginToken.id },
      })

      throw createError({
        statusCode: 401,
        message: 'Token has expired',
      })
    }

    // Get or create user
    let user = loginToken.user
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: loginToken.email },
      })

      if (!user) {
        throw createError({
          statusCode: 404,
          message: 'User not found',
        })
      }
    }

    // Check if user is active
    if (!user.isActive) {
      // Delete the used token
      await prisma.loginToken.delete({
        where: { id: loginToken.id },
      })

      throw createError({
        statusCode: 403,
        message: 'Account has been deactivated',
      })
    }

    // Check if this is the super admin
    const config = useRuntimeConfig()
    const isSuperAdmin = config.superAdminEmail && user.email.toLowerCase() === config.superAdminEmail.toLowerCase()

    // Mark email as verified and upgrade super admin to ADMIN role
    if (!user.emailVerified || (isSuperAdmin && user.role !== 'ADMIN')) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          ...(isSuperAdmin && { role: 'ADMIN' }),
        },
      })
    }

    // Set default region based on IP if user doesn't have one
    if (!user.regionId) {
      try {
        const ip = getRequestIP(event, { xForwardedFor: true })
        if (ip) {
          const location = await getLocationFromIp(ip)
          if (location) {
            // Find nearest region
            const regions = await prisma.region.findMany({
              where: {
                isActive: true,
                centroidLat: { not: null },
                centroidLng: { not: null },
              },
              select: {
                id: true,
                centroidLat: true,
                centroidLng: true,
              },
            })

            if (regions.length > 0) {
              let nearestRegion = regions[0]!
              let nearestDistance = haversineDistance(
                location.lat, location.lng,
                nearestRegion.centroidLat!, nearestRegion.centroidLng!
              )

              for (const region of regions.slice(1)) {
                const distance = haversineDistance(
                  location.lat, location.lng,
                  region.centroidLat!, region.centroidLng!
                )
                if (distance < nearestDistance) {
                  nearestDistance = distance
                  nearestRegion = region
                }
              }

              // Only set region if within reasonable distance (e.g., 100 miles)
              if (nearestDistance <= 100) {
                user = await prisma.user.update({
                  where: { id: user.id },
                  data: { regionId: nearestRegion.id },
                })
              }
            }
          }
        }
      } catch (geoError) {
        // Don't fail login if geolocation fails
        console.error('Failed to set default region from IP:', geoError)
      }
    }

    // Create session
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    })

    // Delete the used token
    await prisma.loginToken.delete({
      where: { id: loginToken.id },
    })

    return {
      success: true,
      message: 'Successfully logged in',
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        role: user.role,
      },
    }
  } catch (error) {
    console.error('Error verifying magic link:', error)

    // If it's already a createError, rethrow it
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to verify magic link',
    })
  }
})
