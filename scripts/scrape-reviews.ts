/**
 * Script to scrape reviews from configured sources
 * Usage: npx tsx scripts/scrape-reviews.ts
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { scrapeFreakscene } from '../server/scrapers/reviews/freakscene'

// Initialize Prisma
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicApiKey) {
    console.error('ANTHROPIC_API_KEY not set')
    process.exit(1)
  }

  console.log('Starting review scraper...\n')

  const result = await scrapeFreakscene(prisma, anthropicApiKey)

  console.log('\n--- Summary ---')
  console.log(`New reviews saved: ${result.newReviews}`)
  console.log(`Artist matches: ${result.artistMatches}`)

  // Show all artist reviews
  const artistReviews = await prisma.artistReview.findMany({
    include: {
      artist: true,
      review: {
        include: { source: true },
      },
    },
    orderBy: { review: { publishedAt: 'desc' } },
  })

  console.log(`\n--- All Artist Reviews (${artistReviews.length}) ---`)
  for (const ar of artistReviews) {
    console.log(`\n${ar.artist.name}:`)
    console.log(`  "${ar.review.title}"`)
    console.log(`  ${ar.review.url}`)
    console.log(`  Published: ${ar.review.publishedAt?.toLocaleDateString() || 'Unknown'}`)
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
