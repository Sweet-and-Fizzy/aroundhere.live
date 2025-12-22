/**
 * Check for suspicious duplicates in PRODUCTION data
 *
 * Run with: npx tsx server/scrapers/__tests__/check-real-duplicates-prod.ts
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { similarityScore, isSameDay } from '../dedup'

// Production database connection
const PROD_DATABASE_URL = process.env.PROD_DATABASE_URL

if (!PROD_DATABASE_URL) {
  console.error('Error: PROD_DATABASE_URL environment variable not set')
  console.error('Set it with: export PROD_DATABASE_URL="postgresql://..."')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: PROD_DATABASE_URL,
  max: 5,
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

interface DuplicateCandidate {
  event1: { id: string; title: string; startsAt: Date; createdAt: Date }
  event2: { id: string; title: string; startsAt: Date; createdAt: Date }
  similarity: number
  venueName: string
  sourceName: string
}

async function findDuplicates() {
  console.log('=== Checking PRODUCTION Data for Suspicious Duplicates ===\n')

  // Get all venues that have events
  const venues = await prisma.venue.findMany({
    where: {
      events: {
        some: {},
      },
    },
    select: {
      id: true,
      name: true,
    },
  })

  console.log(`Scanning ${venues.length} venues...\n`)

  const allDuplicates: DuplicateCandidate[] = []

  for (const venue of venues) {
    // Get all events for this venue from the last 6 months
    const events = await prisma.event.findMany({
      where: {
        venueId: venue.id,
        startsAt: {
          gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // Last 6 months
        },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        createdAt: true,
        source: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        startsAt: 'asc',
      },
    })

    // Compare each pair of events on the same day
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const e1 = events[i]
        const e2 = events[j]

        // Skip if not on the same day
        if (!isSameDay(e1.startsAt, e2.startsAt)) continue

        // Skip if exact same title (these are intentional, not duplicates)
        if (e1.title === e2.title) continue

        const similarity = similarityScore(e1.title, e2.title)

        // Flag if similarity is above threshold
        if (similarity >= 0.7) {
          allDuplicates.push({
            event1: {
              id: e1.id,
              title: e1.title,
              startsAt: e1.startsAt,
              createdAt: e1.createdAt,
            },
            event2: {
              id: e2.id,
              title: e2.title,
              startsAt: e2.startsAt,
              createdAt: e2.createdAt,
            },
            similarity,
            venueName: venue.name,
            sourceName: e1.source?.name || 'Unknown',
          })
        }
      }
    }
  }

  // Sort by similarity (highest first)
  allDuplicates.sort((a, b) => b.similarity - a.similarity)

  if (allDuplicates.length === 0) {
    console.log('✅ No suspicious duplicates found!')
  } else {
    console.log(`⚠️  Found ${allDuplicates.length} suspicious duplicate pair(s):\n`)

    for (const dup of allDuplicates) {
      console.log(`--- ${dup.venueName} (${dup.sourceName}) ---`)
      console.log(`  Event 1: "${dup.event1.title}"`)
      console.log(`    Date: ${dup.event1.startsAt.toLocaleDateString()}`)
      console.log(`    Created: ${dup.event1.createdAt.toLocaleString()}`)
      console.log(`  Event 2: "${dup.event2.title}"`)
      console.log(`    Date: ${dup.event2.startsAt.toLocaleDateString()}`)
      console.log(`    Created: ${dup.event2.createdAt.toLocaleString()}`)
      console.log(`  Similarity: ${(dup.similarity * 100).toFixed(1)}%`)
      console.log('')
    }
  }

  console.log('=== Scan complete ===')
  await pool.end()
  process.exit(0)
}

findDuplicates().catch(async (err) => {
  console.error('Error:', err)
  await pool.end()
  process.exit(1)
})
