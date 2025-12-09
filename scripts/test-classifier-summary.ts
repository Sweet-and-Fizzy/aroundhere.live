/**
 * Test the classifier summary generation
 * Usage: npx tsx scripts/test-classifier-summary.ts
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { classifier } from '../server/services/classifier'

// Initialize Prisma with pg adapter
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // Find a few events with descriptions that are already classified
  const events = await prisma.event.findMany({
    where: {
      description: { not: null },
      startsAt: { gte: new Date() },
      isMusic: { not: null }
    },
    include: {
      venue: { select: { name: true } }
    },
    take: 5
  })

  if (events.length === 0) {
    console.log('No classified events with descriptions found')
    return
  }

  console.log(`Testing classifier on ${events.length} events...\n`)

  // Prepare inputs
  const inputs = events.map(e => ({
    id: e.id,
    title: e.title,
    description: e.description,
    venueName: e.venue?.name,
    existingTags: e.genres
  }))

  // Run classifier
  const results = await classifier.classifyBatch(inputs)

  // Display results
  for (const result of results) {
    const event = events.find(e => e.id === result.eventId)
    console.log('---')
    console.log('Title:', event?.title)
    console.log('Description:', event?.description?.slice(0, 150) + '...')
    console.log('Generated Summary:', result.summary || '(none)')
    console.log('isMusic:', result.isMusic)
    console.log('Genres:', result.canonicalGenres.join(', '))
    console.log()
  }

  // Optionally save the summaries
  console.log('Saving summaries to database...')
  for (const result of results) {
    if (result.summary) {
      await prisma.event.update({
        where: { id: result.eventId },
        data: { summary: result.summary }
      })
    }
  }
  console.log('Done!')
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
