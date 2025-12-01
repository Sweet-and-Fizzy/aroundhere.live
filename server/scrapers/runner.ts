import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import type { ScraperResult, BaseScraper } from './types'
import { saveEvent } from './save-events'
import { classifyPendingEvents } from './classify-events'
import { FailureDetectionService } from '../services/failure-detection'

// Import scrapers
import { IronHorseScraper } from './venues/iron-horse'
import { TheDrakeScraper } from './venues/the-drake'
import { NewCityBreweryScraper } from './venues/new-city-brewery'
import { HazeScraper } from './venues/haze'
import { ParlorRoomScraper } from './venues/parlor-room'
import { DeLaLuzScraper } from './venues/de-la-luz'
import { MarigoldScraper } from './venues/marigold'
import { ProgressionBrewingScraper } from './venues/progression-brewing'
import { StoneChurchScraper } from './venues/stone-church'
import { MarigoldBrattleboroScraper } from './venues/marigold-brattleboro'

// Initialize Prisma with its own pool for CLI usage
// (CLI scripts need explicit cleanup, unlike long-running server processes)
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/local_music'
const pool = new pg.Pool({
  connectionString,
  max: 10,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Initialize failure detection service
const failureDetection = new FailureDetectionService(prisma)

// Registry of all scrapers
const scrapers: BaseScraper[] = [
  new IronHorseScraper(),
  new TheDrakeScraper(),
  new NewCityBreweryScraper(),
  new HazeScraper(),
  new ParlorRoomScraper(),
  new DeLaLuzScraper(),
  new MarigoldScraper(),
  new ProgressionBrewingScraper(),
  new StoneChurchScraper(),
  new MarigoldBrattleboroScraper(),
]

export interface RunnerResult {
  scraperId: string
  scraperName: string
  result: ScraperResult
  savedEvents: number
  skippedEvents: number
}

export async function runScraper(scraper: BaseScraper): Promise<RunnerResult> {
  console.log(`\n[Runner] Starting scraper: ${scraper.config.name}`)

  const result = await scraper.scrape()

  // Detect failures and notify if needed
  const failureDetectionResult = await failureDetection.detectFailure(scraper, result)
  
  console.log(`[Runner] Failure detection: hasFailure=${failureDetectionResult.hasFailure}, shouldNotify=${failureDetectionResult.shouldNotify}, type=${failureDetectionResult.failureType || 'none'}`)
  
  if (failureDetectionResult.hasFailure && failureDetectionResult.shouldNotify) {
    console.log(`[Runner] Triggering notification for ${scraper.config.name}`)
    // Try to capture HTML snapshot for debugging (optional)
    let htmlSnapshot: string | undefined
    try {
      // For HttpScrapers, we can fetch the URL again
      if (scraper instanceof (await import('./base')).HttpScraper) {
        const response = await fetch(scraper.config.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        })
        if (response.ok) {
          htmlSnapshot = await response.text()
        }
      }
    } catch {
      // Ignore errors getting HTML snapshot - it's optional
    }
    
    await failureDetection.notifyFailure(scraper, result, failureDetectionResult, htmlSnapshot)
  }

  // Get or create the source
  const source = await prisma.source.upsert({
    where: { slug: scraper.config.id },
    update: {
      lastRunAt: new Date(),
      lastRunStatus: result.success && !failureDetectionResult.hasFailure ? 'success' : 'failed',
      // Reset consecutive failures on success (if fields exist in database)
      ...(result.success && !failureDetectionResult.hasFailure
        ? { consecutiveFailures: 0, lastFailureAt: null }
        : {}),
    },
    create: {
      name: scraper.config.name,
      slug: scraper.config.id,
      type: 'SCRAPER',
      category: scraper.config.category || 'OTHER',
      priority: scraper.config.priority || 50,
      trustScore: 0.8,
      website: scraper.config.url,
      lastRunAt: new Date(),
      lastRunStatus: result.success && !failureDetectionResult.hasFailure ? 'success' : 'failed',
    },
  })

  let savedEvents = 0
  let skippedEvents = 0

  if (result.success && result.events.length > 0) {
    // Get the venue for this scraper
    const venue = await prisma.venue.findFirst({
      where: { slug: scraper.config.venueSlug },
      include: { region: true },
    })

    if (!venue) {
      console.error(`[Runner] Venue not found for slug: ${scraper.config.venueSlug}`)
      result.errors.push(`Venue not found: ${scraper.config.venueSlug}`)
    } else {
      // Get the priority (may differ from config if source already existed)
      const sourceWithPriority = { id: source.id, priority: source.priority }

      // Process each event
      for (const scrapedEvent of result.events) {
        try {
          const saved = await saveEvent(prisma, scrapedEvent, venue, sourceWithPriority, scraper.config.defaultAgeRestriction)
          if (saved) {
            savedEvents++
          } else {
            skippedEvents++
          }
        } catch (error) {
          console.error(`[Runner] Error saving event: ${scrapedEvent.title}`, error)
          skippedEvents++
        }
      }
    }
  }

  console.log(`[Runner] Completed: ${savedEvents} saved, ${skippedEvents} skipped`)

  return {
    scraperId: scraper.config.id,
    scraperName: scraper.config.name,
    result,
    savedEvents,
    skippedEvents,
  }
}

export async function runAllScrapers(): Promise<RunnerResult[]> {
  const results: RunnerResult[] = []

  for (const scraper of scrapers) {
    if (!scraper.config.enabled) {
      console.log(`[Runner] Skipping disabled scraper: ${scraper.config.name}`)
      continue
    }

    const result = await runScraper(scraper)
    results.push(result)
  }

  // Classify all unclassified events after scraping
  await classifyPendingEvents(prisma)

  return results
}

export async function cleanup(): Promise<void> {
  await prisma.$disconnect()
  await pool.end()
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllScrapers()
    .then((results) => {
      console.log('\n=== SCRAPE SUMMARY ===')
      for (const r of results) {
        console.log(`${r.scraperName}: ${r.savedEvents} new, ${r.skippedEvents} skipped`)
      }
    })
    .catch(console.error)
    .finally(() => cleanup())
}
