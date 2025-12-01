/**
 * Export AI-generated scrapers for migration to production
 * Run with: npx tsx scripts/export-scrapers.ts > scrapers-export.json
 */

import 'dotenv/config'
import prisma from '../server/utils/prisma'

async function main() {
  // Get all sources with AI-generated scrapers
  const sources = await prisma.source.findMany({
    where: {
      type: 'SCRAPER',
      config: { not: null },
    },
    include: {
      // Include venue info for reference
    },
  })

  // Also get venue data for reference
  const venues = await prisma.venue.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      website: true,
      latitude: true,
      longitude: true,
      venueType: true,
      regionId: true,
    },
  })

  const exportData = {
    exportedAt: new Date().toISOString(),
    sources: sources.map(s => ({
      name: s.name,
      slug: s.slug,
      type: s.type,
      category: s.category,
      website: s.website,
      config: s.config,
      isActive: s.isActive,
    })),
    venues: venues.map(v => ({
      name: v.name,
      slug: v.slug,
      address: v.address,
      city: v.city,
      state: v.state,
      postalCode: v.postalCode,
      website: v.website,
      latitude: v.latitude,
      longitude: v.longitude,
      venueType: v.venueType,
    })),
  }

  console.log(JSON.stringify(exportData, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
