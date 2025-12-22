/**
 * Integration test for duplicate detection
 *
 * This script tests the detectSuspiciousDuplicates function with real database data.
 * Run with: npx tsx server/scrapers/__tests__/run-duplicate-detection-test.ts
 */

import 'dotenv/config'
import prisma from '../../utils/prisma'
import { detectSuspiciousDuplicates } from '../save-events'

const TEST_PREFIX = 'test-dup-detection-'

async function cleanup() {
  console.log('Cleaning up test data...')
  await prisma.event.deleteMany({
    where: { id: { startsWith: TEST_PREFIX } },
  })
  await prisma.source.deleteMany({
    where: { id: { startsWith: TEST_PREFIX } },
  })
  await prisma.venue.deleteMany({
    where: { id: { startsWith: TEST_PREFIX } },
  })
  await prisma.region.deleteMany({
    where: { id: { startsWith: TEST_PREFIX } },
  })
}

async function runTests() {
  console.log('=== Duplicate Detection Integration Test ===\n')

  try {
    // Cleanup any previous test data
    await cleanup()

    // Create test region
    console.log('Creating test fixtures...')
    const region = await prisma.region.create({
      data: {
        id: `${TEST_PREFIX}region`,
        name: `${TEST_PREFIX}Test Region`,
        slug: `${TEST_PREFIX}test-region`,
      },
    })

    // Create test venue
    const venue = await prisma.venue.create({
      data: {
        id: `${TEST_PREFIX}venue`,
        name: `${TEST_PREFIX}Test Venue`,
        slug: `${TEST_PREFIX}test-venue`,
        regionId: region.id,
      },
    })

    // Create test source
    const source = await prisma.source.create({
      data: {
        id: `${TEST_PREFIX}source`,
        name: `${TEST_PREFIX}Test Source`,
        slug: `${TEST_PREFIX}test-source`,
        type: 'SCRAPER',
      },
    })

    // Test 1: Detect similar events
    console.log('\n--- Test 1: Detect similar events ---')
    const eventDate = new Date('2025-12-25T20:00:00Z')

    // Create an "existing" event (created before this run)
    await prisma.event.create({
      data: {
        id: `${TEST_PREFIX}existing-event`,
        title: 'The Rolling Stones',
        slug: `${TEST_PREFIX}rolling-stones`,
        startsAt: eventDate,
        regionId: region.id,
        venueId: venue.id,
        sourceId: source.id,
        createdAt: new Date(Date.now() - 86400000), // 1 day ago
      },
    })
    console.log('Created existing event: "The Rolling Stones"')

    // Wait a tiny bit and record the run start time
    await new Promise((r) => setTimeout(r, 10))
    const runStartTime = new Date()

    // Create a "new" event that looks like a duplicate
    await prisma.event.create({
      data: {
        id: `${TEST_PREFIX}new-duplicate`,
        title: 'Rolling Stones', // Similar but not identical
        slug: `${TEST_PREFIX}rolling-stones-2`,
        startsAt: eventDate,
        regionId: region.id,
        venueId: venue.id,
        sourceId: source.id,
        createdAt: new Date(), // Just now
      },
    })
    console.log('Created new event: "Rolling Stones"')

    // Run detection
    const duplicates = await detectSuspiciousDuplicates(
      prisma,
      source.id,
      venue.id,
      runStartTime
    )

    console.log(`\nDetected ${duplicates.length} suspicious duplicate(s)`)
    for (const dup of duplicates) {
      console.log(
        `  - "${dup.newEvent.title}" similar to "${dup.existingEvent.title}" (${(dup.similarity * 100).toFixed(1)}% match)`
      )
    }

    if (duplicates.length === 1) {
      console.log('✅ Test 1 PASSED: Duplicate detected correctly')
    } else {
      console.log('❌ Test 1 FAILED: Expected 1 duplicate, got', duplicates.length)
    }

    // Clean up for next test
    await prisma.event.deleteMany({
      where: { id: { startsWith: TEST_PREFIX } },
    })

    // Test 2: Different events should not be flagged
    console.log('\n--- Test 2: Different events should not be flagged ---')

    await prisma.event.create({
      data: {
        id: `${TEST_PREFIX}existing-beatles`,
        title: 'The Beatles',
        slug: `${TEST_PREFIX}beatles`,
        startsAt: eventDate,
        regionId: region.id,
        venueId: venue.id,
        sourceId: source.id,
        createdAt: new Date(Date.now() - 86400000),
      },
    })
    console.log('Created existing event: "The Beatles"')

    const runStartTime2 = new Date()

    await prisma.event.create({
      data: {
        id: `${TEST_PREFIX}new-zeppelin`,
        title: 'Led Zeppelin',
        slug: `${TEST_PREFIX}zeppelin`,
        startsAt: eventDate,
        regionId: region.id,
        venueId: venue.id,
        sourceId: source.id,
        createdAt: new Date(),
      },
    })
    console.log('Created new event: "Led Zeppelin"')

    const duplicates2 = await detectSuspiciousDuplicates(
      prisma,
      source.id,
      venue.id,
      runStartTime2
    )

    console.log(`\nDetected ${duplicates2.length} suspicious duplicate(s)`)

    if (duplicates2.length === 0) {
      console.log('✅ Test 2 PASSED: No false positives for different events')
    } else {
      console.log('❌ Test 2 FAILED: Expected 0 duplicates, got', duplicates2.length)
    }

    // Clean up for next test
    await prisma.event.deleteMany({
      where: { id: { startsWith: TEST_PREFIX } },
    })

    // Test 3: Events on different days should not be flagged
    console.log('\n--- Test 3: Events on different days should not be flagged ---')

    await prisma.event.create({
      data: {
        id: `${TEST_PREFIX}existing-dec25`,
        title: 'The Rolling Stones',
        slug: `${TEST_PREFIX}stones-dec25`,
        startsAt: new Date('2025-12-25T20:00:00Z'),
        regionId: region.id,
        venueId: venue.id,
        sourceId: source.id,
        createdAt: new Date(Date.now() - 86400000),
      },
    })
    console.log('Created existing event: "The Rolling Stones" on Dec 25')

    const runStartTime3 = new Date()

    await prisma.event.create({
      data: {
        id: `${TEST_PREFIX}new-dec26`,
        title: 'The Rolling Stones',
        slug: `${TEST_PREFIX}stones-dec26`,
        startsAt: new Date('2025-12-26T20:00:00Z'), // Different day
        regionId: region.id,
        venueId: venue.id,
        sourceId: source.id,
        createdAt: new Date(),
      },
    })
    console.log('Created new event: "The Rolling Stones" on Dec 26')

    const duplicates3 = await detectSuspiciousDuplicates(
      prisma,
      source.id,
      venue.id,
      runStartTime3
    )

    console.log(`\nDetected ${duplicates3.length} suspicious duplicate(s)`)

    if (duplicates3.length === 0) {
      console.log('✅ Test 3 PASSED: Events on different days not flagged')
    } else {
      console.log('❌ Test 3 FAILED: Expected 0 duplicates, got', duplicates3.length)
    }

    console.log('\n=== All tests complete ===')
  } finally {
    // Always cleanup
    await cleanup()
  }
  process.exit(0)
}

runTests().catch((err) => {
  console.error('Test error:', err)
  cleanup().then(() => process.exit(1))
})
