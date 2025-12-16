/**
 * Backfill event.regionId from venue.regionId for existing events
 *
 * This script updates all events to have the correct regionId based on their venue's region.
 * Run this once to fix any events that don't have their regionId properly set.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Starting event regionId backfill...\n')

  // Get all events with their venues
  const events = await prisma.event.findMany({
    select: {
      id: true,
      regionId: true,
      venueId: true,
      title: true,
      venue: {
        select: {
          id: true,
          name: true,
          regionId: true,
        },
      },
    },
  })

  console.log(`Found ${events.length} total events`)

  // Find events where regionId doesn't match venue's regionId
  const needsUpdate = events.filter(
    (e) => e.venue && e.regionId !== e.venue.regionId
  )

  console.log(`Found ${needsUpdate.length} events with mismatched regionId\n`)

  if (needsUpdate.length === 0) {
    console.log('All events already have correct regionId! Nothing to do.')
    return
  }

  // Group by venue region to show what's being updated
  const byRegion = new Map<string, number>()
  for (const event of needsUpdate) {
    const regionId = event.venue!.regionId
    byRegion.set(regionId, (byRegion.get(regionId) || 0) + 1)
  }

  console.log('Events to update by region:')
  for (const [regionId, count] of byRegion) {
    // Look up region name
    const region = await prisma.region.findUnique({
      where: { id: regionId },
      select: { name: true },
    })
    console.log(`  ${region?.name || regionId}: ${count} events`)
  }

  console.log('\nUpdating events...')

  let updated = 0
  for (const event of needsUpdate) {
    if (!event.venue) {
      console.log(`  Skipping event ${event.id} - no venue`)
      continue
    }

    await prisma.event.update({
      where: { id: event.id },
      data: { regionId: event.venue.regionId },
    })

    updated++
    if (updated % 100 === 0) {
      console.log(`  Updated ${updated}/${needsUpdate.length} events...`)
    }
  }

  console.log(`\n✓ Successfully updated ${updated} events`)
}

main()
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
