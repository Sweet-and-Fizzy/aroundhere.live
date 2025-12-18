/**
 * Approve an agent session and create venue/source records
 * POST /api/agent/approve
 */

import crypto from 'crypto'
import prisma from '../../utils/prisma'
import { geocodeAddress, buildFullAddress } from '../../services/geocoding'
import { notifyScraperApproved, notifyVenueApproved } from '../../services/notifications'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { sessionId, venueSlug, venueId } = body

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: sessionId',
    })
  }

  // Get session
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
  })

  if (!session) {
    throw createError({
      statusCode: 404,
      message: 'Session not found',
    })
  }

  if (session.status !== 'SUCCESS') {
    throw createError({
      statusCode: 400,
      message: 'Can only approve successful sessions',
    })
  }

  try {
    // Pre-process venue data and geocode BEFORE the transaction
    let geocodedLat: number | null = null
    let geocodedLng: number | null = null
    let venueData: any = null

    if (session.sessionType === 'VENUE_INFO' && session.venueData) {
      venueData = session.venueData as any

      // Validate required fields
      if (!venueData.name) {
        throw new Error('Venue name is required')
      }
      if (!venueData.address || !venueData.city || !venueData.state) {
        throw new Error('Venue address, city, and state are required')
      }

      // Geocode the address BEFORE starting the transaction
      const fullAddress = buildFullAddress(venueData)
      const geocoded = await geocodeAddress(fullAddress)

      if (geocoded) {
        geocodedLat = geocoded.lat
        geocodedLng = geocoded.lng
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let venue = null
      let source = null

      // For venue info sessions, create venue
      if (session.sessionType === 'VENUE_INFO' && venueData) {
        const latitude = geocodedLat ?? venueData.latitude
        const longitude = geocodedLng ?? venueData.longitude

        // Determine region based on location
        // For now, match by state - you can make this more sophisticated later
        let regionId: string | null = null

        // Try to find region by state (e.g., "Western Massachusetts" contains "Massachusetts")
        const regions = await tx.region.findMany({
          where: {
            isActive: true,
            OR: [
              { name: { contains: venueData.state, mode: 'insensitive' } },
              { slug: { contains: venueData.state?.toLowerCase().replace(/\s+/g, '-'), mode: 'insensitive' } },
            ],
          },
        })

        if (regions.length > 0 && regions[0]) {
          regionId = regions[0].id
        } else {
          // Fall back to first active region
          const defaultRegion = await tx.region.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
          })

          if (!defaultRegion) {
            throw new Error('No active regions found in database. Please create a region first.')
          }

          regionId = defaultRegion.id
        }

        // Generate slug if not provided
        let slug = venueSlug || venueData.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-')

        // Check if slug already exists and make it unique if needed
        const existingVenue = await tx.venue.findUnique({
          where: {
            regionId_slug: {
              regionId,
              slug,
            },
          },
        })

        if (existingVenue) {
          // Append a number to make it unique
          let counter = 1
          let uniqueSlug = `${slug}-${counter}`
          while (await tx.venue.findUnique({
            where: {
              regionId_slug: {
                regionId,
                slug: uniqueSlug,
              },
            },
          })) {
            counter++
            uniqueSlug = `${slug}-${counter}`
          }
          slug = uniqueSlug
        }

        venue = await tx.venue.create({
          data: {
            regionId,
            name: venueData.name,
            slug,
            address: venueData.address,
            city: venueData.city,
            state: venueData.state,
            postalCode: venueData.postalCode,
            latitude,
            longitude,
            website: venueData.website,
            phone: venueData.phone,
            description: venueData.description,
            venueType: venueData.venueType || 'OTHER',
            capacity: venueData.capacity,
            imageUrl: venueData.imageUrl,
            verified: false, // Manual review needed
            isActive: true,
          },
        })
      }

      // For event scraper sessions, create source
      if (session.sessionType === 'EVENT_SCRAPER' && session.generatedCode) {
        // Find or get venue from session or request body
        const targetVenueId = venueId || session.venueId
        if (!targetVenueId) {
          throw new Error('Venue ID not provided. Please link this scraper to a venue.')
        }

        const venue = await tx.venue.findUnique({ where: { id: targetVenueId } })
        if (!venue) {
          throw new Error('Venue not found')
        }

        // Create or update source record
        const sourceName = venue.name
        const sourceSlug = venue.slug

        // Check if source already exists for this venue
        const existingSource = await tx.source.findFirst({
          where: {
            OR: [
              { name: sourceName },
              { slug: sourceSlug },
            ]
          },
        })

        if (existingSource) {
          // Update existing source with new scraper code
          source = await tx.source.update({
            where: { id: existingSource.id },
            data: {
              website: session.url,
              config: {
                generatedCode: session.generatedCode,
                sessionId: session.id,
                llmProvider: session.llmProvider,
                llmModel: session.llmModel,
                venueId: targetVenueId,
                venueSlug: venue.slug,
              },
              isActive: true,
            },
          })
        } else {
          source = await tx.source.create({
            data: {
              name: sourceName,
              slug: sourceSlug,
              type: 'SCRAPER',
              category: 'VENUE',
              priority: 10,
              trustScore: 0.8,
              website: session.url,
              parserVersion: '1.0.0-ai',
              config: {
                generatedCode: session.generatedCode,
                sessionId: session.id,
                llmProvider: session.llmProvider,
                llmModel: session.llmModel,
                venueId: targetVenueId,
                venueSlug: venue.slug,
              },
              isActive: true,
            },
          })
        }

        // Create ScraperVersion v1 (or next version)
        const lastVersion = await tx.scraperVersion.findFirst({
          where: { sourceId: source.id },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        })

        const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1
        const codeHash = crypto.createHash('sha256').update(session.generatedCode).digest('hex')

        await tx.scraperVersion.create({
          data: {
            sourceId: source.id,
            versionNumber: nextVersionNumber,
            code: session.generatedCode,
            codeHash,
            description: nextVersionNumber === 1
              ? 'Initial AI-generated scraper'
              : `AI-generated update from session ${session.id.substring(0, 8)}`,
            createdFrom: 'AI_GENERATED',
            agentSessionId: session.id,
            isActive: true,
          },
        })
      }

      // Update session as approved
      await tx.agentSession.update({
        where: { id: sessionId },
        data: {
          status: 'APPROVED',
          venueId: venue?.id,
          sourceId: source?.id,
        },
      })

      return { venue, source }
    })

    // Send Slack notifications
    if (result.venue) {
      const venueData = session.venueData as any
      notifyVenueApproved({
        venueName: result.venue.name,
        venueUrl: session.url,
        city: venueData?.city,
        state: venueData?.state,
        llmProvider: session.llmProvider,
        llmModel: session.llmModel,
      }).catch(err => console.error('[Approve] Failed to send Slack notification:', err))
    }

    if (result.source) {
      const venue = await prisma.venue.findUnique({ where: { id: venueId || session.venueId || '' } })
      notifyScraperApproved({
        venueName: venue?.name || result.source.name,
        venueUrl: session.url,
        isUpdate: !!body.venueId, // If venueId was passed, it's an update
        llmProvider: session.llmProvider,
        llmModel: session.llmModel,
      }).catch(err => console.error('[Approve] Failed to send Slack notification:', err))
    }

    return {
      success: true,
      venue: result.venue,
      source: result.source,
    }
  } catch (error) {
    console.error('Approval error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to approve session',
    })
  }
})
