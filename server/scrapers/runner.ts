import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import type { ScrapedEvent, ScraperResult, BaseScraper } from './types'
import { findDuplicate, mergeEventData } from './dedup'
import { classifier } from '../services/classifier'
import type { ClassificationInput } from '../services/classifier/types'
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

// Initialize Prisma
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
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
          const saved = await saveEvent(scrapedEvent, venue, sourceWithPriority, scraper.config.defaultAgeRestriction)
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

async function saveEvent(
  scrapedEvent: ScrapedEvent,
  venue: { id: string; regionId: string },
  source: { id: string; priority: number },
  defaultAgeRestriction?: 'ALL_AGES' | 'EIGHTEEN_PLUS' | 'TWENTY_ONE_PLUS'
): Promise<boolean> {
  // First, check if this exact source already has this event (by source + sourceEventId)
  if (scrapedEvent.sourceEventId) {
    const existingFromSameSource = await prisma.event.findFirst({
      where: {
        sourceId: source.id,
        sourceEventId: scrapedEvent.sourceEventId,
      },
    })

    if (existingFromSameSource) {
      // Update existing event from same source
      await prisma.event.update({
        where: { id: existingFromSameSource.id },
        data: {
          title: cleanHtmlEntities(scrapedEvent.title),
          description: scrapedEvent.description ? cleanHtmlEntities(scrapedEvent.description) : null,
          descriptionHtml: scrapedEvent.descriptionHtml || null,
          imageUrl: scrapedEvent.imageUrl,
          startsAt: scrapedEvent.startsAt,
          endsAt: scrapedEvent.endsAt,
          doorsAt: scrapedEvent.doorsAt,
          coverCharge: scrapedEvent.coverCharge,
          ticketUrl: scrapedEvent.ticketUrl,
          sourceUrl: scrapedEvent.sourceUrl,
          genres: scrapedEvent.genres || [],
          updatedAt: new Date(),
        },
      })
      return false // Not a new event
    }
  }

  // Check for duplicates from other sources using fuzzy matching
  const dedupResult = await findDuplicate(
    prisma,
    scrapedEvent,
    venue.id,
    source.id,
    source.priority
  )

  if (dedupResult.isDuplicate && dedupResult.existingEventId) {
    console.log(`[Runner] Found duplicate: "${scrapedEvent.title}" matches existing event (similarity: ${dedupResult.similarity.toFixed(2)})`)

    // Record this source as having found this event
    await prisma.eventSource.upsert({
      where: {
        eventId_sourceId: {
          eventId: dedupResult.existingEventId,
          sourceId: source.id,
        },
      },
      update: {
        sourceUrl: scrapedEvent.sourceUrl,
        sourceEventId: scrapedEvent.sourceEventId,
        scrapedAt: new Date(),
        rawData: scrapedEvent as unknown as Record<string, unknown>,
      },
      create: {
        eventId: dedupResult.existingEventId,
        sourceId: source.id,
        sourceUrl: scrapedEvent.sourceUrl,
        sourceEventId: scrapedEvent.sourceEventId,
        rawData: scrapedEvent as unknown as Record<string, unknown>,
      },
    })

    if (dedupResult.shouldUpdateCanonical) {
      // This source has higher priority, update the canonical event
      console.log(`[Runner] Updating canonical source (higher priority)`)
      await prisma.event.update({
        where: { id: dedupResult.existingEventId },
        data: {
          sourceId: source.id,
          sourceEventId: scrapedEvent.sourceEventId,
          sourceUrl: scrapedEvent.sourceUrl,
          title: cleanHtmlEntities(scrapedEvent.title),
          description: scrapedEvent.description ? cleanHtmlEntities(scrapedEvent.description) : undefined,
          imageUrl: scrapedEvent.imageUrl,
          coverCharge: scrapedEvent.coverCharge,
          ticketUrl: scrapedEvent.ticketUrl,
          genres: scrapedEvent.genres || [],
          updatedAt: new Date(),
        },
      })
    } else {
      // Lower priority source - only fill in missing data
      const existing = await prisma.event.findUnique({
        where: { id: dedupResult.existingEventId },
      })
      if (existing) {
        const updates = mergeEventData(existing, scrapedEvent)
        if (Object.keys(updates).length > 0) {
          await prisma.event.update({
            where: { id: dedupResult.existingEventId },
            data: {
              ...updates,
              updatedAt: new Date(),
            },
          })
        }
      }
    }

    return false // Duplicate, not a new event
  }

  // Generate slug
  const slug = generateSlug(scrapedEvent.title, scrapedEvent.startsAt)

  // Create new event
  const event = await prisma.event.create({
    data: {
      regionId: venue.regionId,
      venueId: venue.id,
      title: cleanHtmlEntities(scrapedEvent.title),
      slug,
      description: scrapedEvent.description ? cleanHtmlEntities(scrapedEvent.description) : null,
      descriptionHtml: scrapedEvent.descriptionHtml || null,
      imageUrl: scrapedEvent.imageUrl,
      startsAt: scrapedEvent.startsAt,
      endsAt: scrapedEvent.endsAt,
      doorsAt: scrapedEvent.doorsAt,
      coverCharge: scrapedEvent.coverCharge,
      ageRestriction: scrapedEvent.ageRestriction || defaultAgeRestriction || 'ALL_AGES',
      ticketUrl: scrapedEvent.ticketUrl,
      genres: scrapedEvent.genres || [],
      sourceId: source.id,
      sourceUrl: scrapedEvent.sourceUrl,
      sourceEventId: scrapedEvent.sourceEventId,
      confidenceScore: 0.8,
      reviewStatus: 'PENDING', // New events need review
    },
  })

  // Also record in EventSource for tracking all sources
  await prisma.eventSource.create({
    data: {
      eventId: event.id,
      sourceId: source.id,
      sourceUrl: scrapedEvent.sourceUrl,
      sourceEventId: scrapedEvent.sourceEventId,
      rawData: scrapedEvent as unknown as Record<string, unknown>,
    },
  })

  // Note: Artist associations are handled manually via admin curation
  // The scraped title contains artist info which is displayed as-is

  return true // New event created
}

function generateSlug(text: string, date?: Date): string {
  let slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  if (date) {
    const dateStr = date.toISOString().split('T')[0]
    slug = `${slug}-${dateStr}`
  }

  return slug
}

function cleanHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
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

  // Classify any unclassified events after scraping
  await classifyNewEvents()

  return results
}

/**
 * Classify any events that haven't been classified yet
 */
async function classifyNewEvents(): Promise<void> {
  const unclassified = await prisma.event.findMany({
    where: {
      isMusic: null,
      startsAt: { gte: new Date() },
    },
    include: {
      venue: { select: { name: true } },
    },
    take: 50, // Process up to 50 at a time
  })

  if (unclassified.length === 0) {
    console.log('[Runner] No unclassified events to process')
    return
  }

  console.log(`[Runner] Classifying ${unclassified.length} new events...`)

  const inputs: ClassificationInput[] = unclassified.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    venueName: e.venue?.name,
    existingTags: e.genres,
  }))

  try {
    const results = await classifier.classifyWithFallback(inputs)

    for (const result of results) {
      await prisma.event.update({
        where: { id: result.eventId },
        data: {
          isMusic: result.isMusic,
          eventType: result.eventType,
          canonicalGenres: result.canonicalGenres,
          classifiedAt: new Date(),
          classificationConfidence: result.confidence,
        },
      })
    }

    const musicCount = results.filter((r) => r.isMusic).length
    console.log(`[Runner] Classified ${results.length} events (${musicCount} music, ${results.length - musicCount} non-music)`)
  } catch (error) {
    console.error('[Runner] Classification failed:', error)
  }
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
