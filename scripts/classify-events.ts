import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { classifier } from '../server/services/classifier'
import type { ClassificationInput } from '../server/services/classifier/types'

// Initialize Prisma
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const BATCH_SIZE = parseInt(process.env.CLASSIFIER_BATCH_SIZE || '10')

async function classifyEvents(options: {
  limit?: number
  reclassify?: boolean
  dryRun?: boolean
}) {
  const { limit, reclassify = false, dryRun = false } = options

  console.log('=== Event Classifier ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Reclassify: ${reclassify}`)
  console.log(`Batch size: ${BATCH_SIZE}`)
  console.log('')

  // Find events to classify
  const whereClause = reclassify
    ? {} // Reclassify all
    : { isMusic: null } // Only unclassified

  const events = await prisma.event.findMany({
    where: {
      ...whereClause,
      startsAt: { gte: new Date() }, // Only future events
    },
    include: {
      venue: { select: { name: true } },
    },
    orderBy: { startsAt: 'asc' },
    take: limit,
  })

  console.log(`Found ${events.length} events to classify`)

  if (events.length === 0) {
    console.log('No events to classify')
    return
  }

  let processed = 0
  let musicEvents = 0
  let nonMusicEvents = 0
  let errors = 0

  // Process in batches
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE)
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(events.length / BATCH_SIZE)}`)

    const inputs: ClassificationInput[] = batch.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      venueName: e.venue?.name,
      existingTags: e.genres,
    }))

    try {
      const results = await classifier.classifyWithFallback(inputs)

      for (const result of results) {
        const event = batch.find((e) => e.id === result.eventId)
        if (!event) continue

        console.log(`  ${event.title.slice(0, 50)}...`)
        console.log(`    isMusic: ${result.isMusic}, type: ${result.eventType}, genres: [${result.canonicalGenres.join(', ')}]`)
        console.log(`    confidence: ${result.confidence.toFixed(2)}`)

        if (result.isMusic) {
          musicEvents++
        } else {
          nonMusicEvents++
        }
        processed++

        if (!dryRun) {
          await prisma.event.update({
            where: { id: event.id },
            data: {
              isMusic: result.isMusic,
              eventType: result.eventType,
              canonicalGenres: result.canonicalGenres,
              classifiedAt: new Date(),
              classificationConfidence: result.confidence,
            },
          })
        }
      }
    } catch (error) {
      console.error(`  Error classifying batch:`, error)
      errors += batch.length
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < events.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  console.log('\n=== Classification Complete ===')
  console.log(`Processed: ${processed}`)
  console.log(`Music events: ${musicEvents}`)
  console.log(`Non-music events: ${nonMusicEvents}`)
  console.log(`Errors: ${errors}`)
}

async function main() {
  const args = process.argv.slice(2)
  const options = {
    limit: undefined as number | undefined,
    reclassify: false,
    dryRun: false,
  }

  for (const arg of args) {
    if (arg === '--reclassify') {
      options.reclassify = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1])
    } else if (arg === '--help') {
      console.log(`
Usage: npx tsx scripts/classify-events.ts [options]

Options:
  --limit=N      Process at most N events
  --reclassify   Reclassify all events (not just unclassified)
  --dry-run      Don't save results to database
  --help         Show this help message

Environment variables:
  ANTHROPIC_API_KEY     Required for Claude API
  CLASSIFIER_MODEL      Model to use (default: claude-3-5-haiku-20241022)
  CLASSIFIER_BATCH_SIZE Number of events per API call (default: 10)
`)
      process.exit(0)
    }
  }

  await classifyEvents(options)
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
