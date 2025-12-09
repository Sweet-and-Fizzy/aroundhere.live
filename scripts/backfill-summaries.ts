/**
 * Backfill summaries for existing events
 * Re-classifies events that are missing summaries to generate them
 *
 * Usage: npx tsx scripts/backfill-summaries.ts [--limit N] [--dry-run]
 */

import 'dotenv/config'
import prisma from '../server/utils/prisma'
import { classifier } from '../server/services/classifier'
import type { ClassificationInput } from '../server/services/classifier/types'

const BATCH_SIZE = 20 // Same as classify-events.ts

async function backfillSummaries(limit?: number, dryRun = false) {
  console.log(`Starting summary backfill${dryRun ? ' (dry run)' : ''}...`)

  // Find upcoming music events without summaries
  const needsSummary = await prisma.event.count({
    where: {
      isMusic: true,
      startsAt: { gte: new Date() },
      summary: null,
      description: { not: null }, // Must have description to generate summary
    },
  })

  console.log(`Found ${needsSummary} events needing summaries`)

  if (needsSummary === 0 || dryRun) {
    return
  }

  let processed = 0
  let updated = 0
  let batchNum = 0
  const failedIds = new Set<string>() // Track IDs that failed to get summaries

  while (true) {
    const events = await prisma.event.findMany({
      where: {
        isMusic: true,
        startsAt: { gte: new Date() },
        summary: null,
        description: { not: null },
        // Exclude events we've already tried and failed
        id: { notIn: Array.from(failedIds) },
      },
      include: {
        venue: { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: limit ? Math.min(BATCH_SIZE, limit - processed) : BATCH_SIZE,
    })

    if (events.length === 0) {
      break
    }

    batchNum++
    console.log(`\nBatch ${batchNum}: Processing ${events.length} events...`)

    const inputs: ClassificationInput[] = events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      venueName: e.venue?.name,
      existingTags: e.genres,
    }))

    try {
      const results = await classifier.classifyBatch(inputs)

      // Update events with summaries
      for (const result of results) {
        if (result.summary) {
          await prisma.event.update({
            where: { id: result.eventId },
            data: { summary: result.summary },
          })
          updated++
        } else {
          // Track events that didn't get summaries to avoid infinite loop
          failedIds.add(result.eventId)
        }
      }

      processed += events.length
      const withSummary = results.filter((r) => r.summary).length
      console.log(
        `  Done. ${withSummary}/${events.length} got summaries. Total: ${processed}/${limit || needsSummary}`
      )

      // Rate limiting
      if (events.length === BATCH_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    } catch (error) {
      console.error(`  Error processing batch:`, error)
      // Mark all events in failed batch to avoid infinite retry
      events.forEach((e) => failedIds.add(e.id))
    }

    if (limit && processed >= limit) {
      break
    }
  }

  console.log(`\nBackfill complete. Updated ${updated} events with summaries.`)
  if (failedIds.size > 0) {
    console.log(`${failedIds.size} events could not get summaries (no description or API error)`)
  }
}

// Parse CLI args
const args = process.argv.slice(2)
let limit: number | undefined
let dryRun = false

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1], 10)
    i++
  }
  if (args[i] === '--dry-run') {
    dryRun = true
  }
}

backfillSummaries(limit, dryRun)
  .catch(console.error)
  .finally(() => prisma.$disconnect())
