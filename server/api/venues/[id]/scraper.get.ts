/**
 * Get the existing scraper for a venue
 * GET /api/venues/:id/scraper
 */

import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'id')

  if (!venueId) {
    throw createError({
      statusCode: 400,
      message: 'Venue ID is required',
    })
  }

  // Get venue info
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      slug: true,
      website: true,
    },
  })

  if (!venue) {
    throw createError({
      statusCode: 404,
      message: 'Venue not found',
    })
  }

  // Find source by matching slug or by venueId in config
  const source = await prisma.source.findFirst({
    where: {
      OR: [
        { slug: venue.slug },
        { name: venue.name },
      ],
      type: 'SCRAPER',
    },
    select: {
      id: true,
      name: true,
      slug: true,
      website: true,
      config: true,
      lastRunAt: true,
      lastRunStatus: true,
      isActive: true,
    },
  })

  if (!source) {
    return {
      venue,
      scraper: null,
    }
  }

  // Extract scraper info from config
  const config = source.config as any

  return {
    venue,
    scraper: {
      id: source.id,
      name: source.name,
      website: source.website,
      lastRunAt: source.lastRunAt,
      lastRunStatus: source.lastRunStatus,
      isActive: source.isActive,
      generatedCode: config?.generatedCode || null,
      llmProvider: config?.llmProvider || null,
      llmModel: config?.llmModel || null,
    },
  }
})
