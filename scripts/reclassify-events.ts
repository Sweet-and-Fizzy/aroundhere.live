/**
 * Reclassify events to apply updated genre taxonomy
 *
 * Usage:
 *   npx tsx scripts/reclassify-events.ts              # Reclassify "world" genre events (dry run)
 *   npx tsx scripts/reclassify-events.ts --apply      # Actually apply changes
 *   npx tsx scripts/reclassify-events.ts --all        # Reclassify ALL music events (dry run)
 *   npx tsx scripts/reclassify-events.ts --all --apply
 */

import 'dotenv/config'
import prisma from '../server/utils/prisma'
import { classifier } from '../server/services/classifier'
import type { ClassificationInput } from '../server/services/classifier/types'

async function main() {
  const args = process.argv.slice(2)
  const dryRun = !args.includes('--apply')
  const all = args.includes('--all')

  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLYING CHANGES'}`)
  console.log(`Scope: ${all ? 'ALL music events' : 'Events with "world" genre only'}\n`)

  // Build query based on scope
  const where: any = {
    isMusic: true,
    startsAt: { gte: new Date() }, // Only future events
  }

  if (!all) {
    where.canonicalGenres = { has: 'world' }
  }

  const events = await prisma.event.findMany({
    where,
    select: {
      id: true,
      title: true,
      description: true,
      canonicalGenres: true,
      venue: {
        select: { name: true }
      }
    },
    orderBy: { startsAt: 'asc' }
  })

  console.log(`Found ${events.length} events to reclassify\n`)

  if (events.length === 0) {
    console.log('No events to reclassify.')
    await prisma.$disconnect()
    return
  }

  // Show what we're about to reclassify
  console.log('Events to reclassify:')
  console.log('='.repeat(60))
  for (const event of events) {
    console.log(`- ${event.title}`)
    console.log(`  Current genres: ${event.canonicalGenres.join(', ') || 'none'}`)
  }
  console.log('='.repeat(60))
  console.log('')

  if (dryRun) {
    console.log('DRY RUN - No changes will be made.')
    console.log('Run with --apply to actually reclassify these events.')
    await prisma.$disconnect()
    return
  }

  // Reclassify in batches
  const batchSize = 10
  let processed = 0
  let changed = 0

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize)

    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(events.length / batchSize)}...`)

    const classificationInput: ClassificationInput[] = batch.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      venueName: e.venue?.name
    }))

    try {
      const results = await classifier.classifyWithFallback(classificationInput)

      for (const result of results) {
        const original = batch.find(e => e.id === result.eventId)
        if (!original) continue

        const oldGenres = original.canonicalGenres.sort().join(', ')
        const newGenres = result.canonicalGenres.sort().join(', ')

        if (oldGenres !== newGenres) {
          console.log(`\n  ${original.title}`)
          console.log(`    Old: ${oldGenres || 'none'}`)
          console.log(`    New: ${newGenres || 'none'}`)

          await prisma.event.update({
            where: { id: result.eventId },
            data: {
              canonicalGenres: result.canonicalGenres,
              isMusic: result.isMusic,
              eventType: result.eventType,
              summary: result.summary,
            }
          })
          changed++
        }

        processed++
      }
    } catch (error) {
      console.error(`Error processing batch: ${error}`)
    }

    // Rate limit between batches
    if (i + batchSize < events.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Processed: ${processed} events`)
  console.log(`Changed: ${changed} events`)
  console.log(`Unchanged: ${processed - changed} events`)

  await prisma.$disconnect()
}

main().catch(console.error)
