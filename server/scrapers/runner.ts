import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import type { ScraperResult, BaseScraper, ScrapedEvent } from './types'
import { saveEvent, saveScrapedEvents } from './save-events'
import { classifyPendingEvents } from './classify-events'
import { FailureDetectionService } from '../services/failure-detection'
import { executeScraperCode } from '../services/agent/executor'

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
      // Reset consecutive failures and save event count on success
      ...(result.success && !failureDetectionResult.hasFailure
        ? { consecutiveFailures: 0, lastFailureAt: null, lastEventCount: result.events.length }
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

/**
 * Run AI-generated scrapers from the database
 */
export async function runAIScrapers(): Promise<RunnerResult[]> {
  const results: RunnerResult[] = []

  // Find all active sources with generated code
  // Note: We filter by isActive and type, then check for generatedCode in the loop
  // because Prisma's JSON path filtering has type issues
  const aiSources = await prisma.source.findMany({
    where: {
      isActive: true,
      type: 'SCRAPER',
    },
  })

  // Filter to only sources with generatedCode
  const aiSourcesWithCode = aiSources.filter(s => {
    const config = s.config as Record<string, unknown> | null
    return config?.generatedCode && config?.venueId
  })

  console.log(`\n[Runner] Found ${aiSourcesWithCode.length} AI-generated scrapers`)

  for (const source of aiSourcesWithCode) {
    const config = source.config as Record<string, unknown>

    console.log(`\n[Runner] Starting AI scraper: ${source.name}`)

    // Get the venue
    const venue = await prisma.venue.findUnique({
      where: { id: config.venueId },
      include: { region: true },
    })

    if (!venue) {
      console.error(`[Runner] Venue not found for AI scraper: ${source.name}`)
      continue
    }

    try {
      // Execute the AI-generated scraper code
      const execResult = await executeScraperCode(
        config.generatedCode,
        source.website || config.url || '',
        venue.region?.timezone || 'America/New_York',
        180000 // 3 minute timeout
      )

      const scrapedEvents: ScrapedEvent[] = execResult.data || []
      let savedEvents = 0
      let skippedEvents = 0

      if (execResult.success && scrapedEvents.length > 0) {
        console.log(`[${source.name}] Scraped ${scrapedEvents.length} events`)

        const venueData = { id: venue.id, regionId: venue.regionId }
        const sourceData = { id: source.id, priority: source.priority }

        const saveResult = await saveScrapedEvents(prisma, scrapedEvents, venueData, sourceData)
        savedEvents = saveResult.saved
        skippedEvents = saveResult.skipped
      } else if (!execResult.success) {
        console.error(`[${source.name}] Execution failed:`, execResult.error)
      }

      // Update source status
      await prisma.source.update({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: execResult.success ? 'success' : 'failed',
        },
      })

      console.log(`[Runner] Completed: ${savedEvents} saved, ${skippedEvents} skipped`)

      results.push({
        scraperId: source.slug,
        scraperName: source.name,
        result: {
          success: execResult.success,
          events: scrapedEvents,
          errors: execResult.error ? [execResult.error] : [],
          scrapedAt: new Date(),
          duration: execResult.executionTime,
        },
        savedEvents,
        skippedEvents,
      })
    } catch (error) {
      console.error(`[Runner] Error running AI scraper ${source.name}:`, error)

      await prisma.source.update({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: 'failed',
        },
      })

      results.push({
        scraperId: source.slug,
        scraperName: source.name,
        result: {
          success: false,
          events: [],
          errors: [error instanceof Error ? error.message : String(error)],
          scrapedAt: new Date(),
          duration: 0,
        },
        savedEvents: 0,
        skippedEvents: 0,
      })
    }
  }

  return results
}

export async function runAllScrapers(): Promise<RunnerResult[]> {
  const results: RunnerResult[] = []

  // Run hardcoded scrapers
  for (const scraper of scrapers) {
    if (!scraper.config.enabled) {
      console.log(`[Runner] Skipping disabled scraper: ${scraper.config.name}`)
      continue
    }

    const result = await runScraper(scraper)
    results.push(result)
  }

  // Run AI-generated scrapers from database
  const aiResults = await runAIScrapers()
  results.push(...aiResults)

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
