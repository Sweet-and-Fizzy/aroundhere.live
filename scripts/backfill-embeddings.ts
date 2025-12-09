/**
 * Backfill embeddings for existing events
 *
 * Usage: npx tsx scripts/backfill-embeddings.ts [--limit N]
 */

import 'dotenv/config'
import prisma from '../server/utils/prisma'
import { generateEmbeddings, buildEventEmbeddingText } from '../server/services/embeddings'

const BATCH_SIZE = 50 // OpenAI allows up to 2048 inputs per request

async function backfillEmbeddings(limit?: number) {
  console.log('Starting embedding backfill...')

  // Find music events without embeddings
  const query = {
    where: {
      isMusic: true,
      startsAt: { gte: new Date() },
    },
    include: {
      eventArtists: {
        include: {
          artist: { select: { name: true } },
        },
      },
    },
    orderBy: { startsAt: 'asc' as const },
    take: limit,
  }

  // Check how many need embeddings using raw SQL
  const needsEmbedding = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM events
    WHERE "isMusic" = true
      AND "startsAt" >= NOW()
      AND embedding IS NULL
  `
  const totalToProcess = Number(needsEmbedding[0].count)
  console.log(`Found ${totalToProcess} events needing embeddings`)

  if (totalToProcess === 0) {
    console.log('No events to process')
    return
  }

  let processed = 0
  let batchNum = 0

  while (true) {
    // Get batch of events without embeddings
    const events = await prisma.$queryRaw<Array<{
      id: string
      title: string
      description: string | null
      canonicalGenres: string[]
      eventType: string | null
    }>>`
      SELECT id, title, description, "canonicalGenres", "eventType"
      FROM events
      WHERE "isMusic" = true
        AND "startsAt" >= NOW()
        AND embedding IS NULL
      ORDER BY "startsAt" ASC
      LIMIT ${limit ? Math.min(BATCH_SIZE, limit - processed) : BATCH_SIZE}
    `

    if (events.length === 0) {
      break
    }

    batchNum++
    console.log(`\nBatch ${batchNum}: Processing ${events.length} events...`)

    // Get artist names for these events
    const eventIds = events.map(e => e.id)
    const artistLinks = await prisma.eventArtist.findMany({
      where: { eventId: { in: eventIds } },
      include: { artist: { select: { name: true } } },
    })

    // Group artists by event
    const artistsByEvent = new Map<string, string[]>()
    for (const link of artistLinks) {
      const artists = artistsByEvent.get(link.eventId) || []
      artists.push(link.artist.name)
      artistsByEvent.set(link.eventId, artists)
    }

    // Build embedding texts
    const embeddingTexts = events.map(event => buildEventEmbeddingText({
      title: event.title,
      description: event.description,
      canonicalGenres: event.canonicalGenres,
      eventType: event.eventType,
      artists: (artistsByEvent.get(event.id) || []).map(name => ({ name })),
    }))

    try {
      // Generate embeddings
      const embeddings = await generateEmbeddings(embeddingTexts)

      // Update events with embeddings
      for (let i = 0; i < events.length; i++) {
        const event = events[i]
        const embedding = embeddings[i]

        await prisma.$executeRawUnsafe(
          `UPDATE events SET embedding = $1::vector WHERE id = $2`,
          `[${embedding.join(',')}]`,
          event.id
        )
      }

      processed += events.length
      console.log(`  Done. Total processed: ${processed}/${limit || totalToProcess}`)

      // Rate limiting - be nice to OpenAI
      if (events.length === BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      console.error(`  Error processing batch:`, error)
      // Continue with next batch
    }

    if (limit && processed >= limit) {
      break
    }
  }

  console.log(`\nBackfill complete. Processed ${processed} events.`)
}

// Parse CLI args
const args = process.argv.slice(2)
let limit: number | undefined

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1], 10)
    i++
  }
}

backfillEmbeddings(limit)
  .catch(console.error)
  .finally(() => prisma.$disconnect())
