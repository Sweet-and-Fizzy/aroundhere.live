/**
 * Import AI-generated scrapers from export file
 * Run with: npx tsx scripts/import-scrapers.ts scrapers-export.json
 */

import 'dotenv/config'
import { readFileSync } from 'fs'
import prisma from '../server/utils/prisma'
import { geocodeAddress, buildFullAddress } from '../server/services/geocoding'

interface ExportData {
  exportedAt: string
  sources: Array<{
    name: string
    slug: string
    type: string
    category: string
    website: string | null
    config: any
    isActive: boolean
  }>
  venues: Array<{
    name: string
    slug: string
    address: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    website: string | null
    latitude: number | null
    longitude: number | null
    venueType: string
  }>
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: npx tsx scripts/import-scrapers.ts <export-file.json>')
    process.exit(1)
  }

  const data: ExportData = JSON.parse(readFileSync(file, 'utf-8'))
  console.log(`Importing from ${data.exportedAt}`)
  console.log(`  ${data.venues.length} venues`)
  console.log(`  ${data.sources.length} sources\n`)

  // Get default region
  const region = await prisma.region.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!region) {
    console.error('No active region found. Please create a region first.')
    process.exit(1)
  }

  // Import venues
  for (const v of data.venues) {
    const existing = await prisma.venue.findFirst({
      where: {
        OR: [
          { slug: v.slug, regionId: region.id },
          { name: v.name, regionId: region.id },
        ],
      },
    })

    if (existing) {
      console.log(`  Venue exists: ${v.name}`)
      continue
    }

    // Geocode if no coordinates
    let lat = v.latitude
    let lng = v.longitude
    if (!lat || !lng) {
      const addr = buildFullAddress({ address: v.address || undefined, city: v.city || undefined, state: v.state || undefined, postalCode: v.postalCode || undefined })
      const geo = await geocodeAddress(addr)
      if (geo) {
        lat = geo.lat
        lng = geo.lng
      }
    }

    await prisma.venue.create({
      data: {
        regionId: region.id,
        name: v.name,
        slug: v.slug,
        address: v.address,
        city: v.city,
        state: v.state,
        postalCode: v.postalCode,
        website: v.website,
        latitude: lat,
        longitude: lng,
        venueType: v.venueType as any || 'OTHER',
        isActive: true,
      },
    })
    console.log(`  Created venue: ${v.name}`)
  }

  // Import sources
  for (const s of data.sources) {
    const existing = await prisma.source.findFirst({
      where: {
        OR: [
          { slug: s.slug },
          { name: s.name },
        ],
      },
    })

    if (existing) {
      // Update existing source with new code
      await prisma.source.update({
        where: { id: existing.id },
        data: {
          config: s.config,
          website: s.website,
          isActive: s.isActive,
        },
      })
      console.log(`  Updated source: ${s.name}`)
      continue
    }

    await prisma.source.create({
      data: {
        name: s.name,
        slug: s.slug,
        type: s.type as any,
        category: s.category as any,
        website: s.website,
        config: s.config,
        isActive: s.isActive,
        priority: 10,
        trustScore: 0.8,
        parserVersion: '1.0.0-ai',
      },
    })
    console.log(`  Created source: ${s.name}`)
  }

  console.log('\nImport complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
