/**
 * Check if a URL already exists in venues or sources
 * POST /api/agent/check-url
 */

import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { url } = body

  if (!url) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: url',
    })
  }

  // Normalize URL for comparison (remove trailing slash, etc.)
  const normalizedUrl = url.replace(/\/+$/, '').toLowerCase()

  // Check venues by website
  const existingVenue = await prisma.venue.findFirst({
    where: {
      OR: [
        { website: { equals: url, mode: 'insensitive' } },
        { website: { equals: normalizedUrl, mode: 'insensitive' } },
        { website: { equals: `${normalizedUrl}/`, mode: 'insensitive' } },
      ],
    },
    include: {
      region: true,
    },
  })

  if (existingVenue) {
    // Check if there's a scraper (source) for this URL
    const existingScraper = await prisma.source.findFirst({
      where: {
        OR: [
          { website: { equals: url, mode: 'insensitive' } },
          { website: { equals: normalizedUrl, mode: 'insensitive' } },
          { website: { equals: `${normalizedUrl}/`, mode: 'insensitive' } },
          { website: { equals: existingVenue.website, mode: 'insensitive' } },
        ],
      },
    })

    return {
      exists: true,
      type: 'venue',
      hasScraper: !!existingScraper,
      data: {
        id: existingVenue.id,
        name: existingVenue.name,
        slug: existingVenue.slug,
        website: existingVenue.website,
        region: existingVenue.region?.name,
        regionId: existingVenue.regionId,
      },
      scraper: existingScraper ? {
        id: existingScraper.id,
        name: existingScraper.name,
        isActive: existingScraper.isActive,
      } : null,
    }
  }

  // Check sources by website (scraper without venue match)
  const existingSource = await prisma.source.findFirst({
    where: {
      OR: [
        { website: { equals: url, mode: 'insensitive' } },
        { website: { equals: normalizedUrl, mode: 'insensitive' } },
        { website: { equals: `${normalizedUrl}/`, mode: 'insensitive' } },
      ],
    },
  })

  if (existingSource) {
    return {
      exists: true,
      type: 'source',
      hasScraper: true,
      data: {
        id: existingSource.id,
        name: existingSource.name,
        slug: existingSource.slug,
        website: existingSource.website,
      },
      scraper: {
        id: existingSource.id,
        name: existingSource.name,
        isActive: existingSource.isActive,
      },
    }
  }

  return {
    exists: false,
    hasScraper: false,
  }
})
