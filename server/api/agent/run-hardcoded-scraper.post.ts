/**
 * Run a hardcoded scraper by venue slug
 * POST /api/agent/run-hardcoded-scraper
 */

import prisma from '../../utils/prisma'
import { saveScrapedEvents } from '../../scrapers/save-events'
import { classifyPendingEvents } from '../../scrapers/classify-events'
import type { BaseScraper } from '../../scrapers/types'

// Import all hardcoded scrapers
import { IronHorseScraper } from '../../scrapers/venues/iron-horse'
import { TheDrakeScraper } from '../../scrapers/venues/the-drake'
import { NewCityBreweryScraper } from '../../scrapers/venues/new-city-brewery'
import { HazeScraper } from '../../scrapers/venues/haze'
import { ParlorRoomScraper } from '../../scrapers/venues/parlor-room'
import { DeLaLuzScraper } from '../../scrapers/venues/de-la-luz'
import { MarigoldScraper } from '../../scrapers/venues/marigold'
import { ProgressionBrewingScraper } from '../../scrapers/venues/progression-brewing'
import { StoneChurchScraper } from '../../scrapers/venues/stone-church'
import { MarigoldBrattleboroScraper } from '../../scrapers/venues/marigold-brattleboro'

// Map of venue slugs to scraper classes
const scraperRegistry: Record<string, () => BaseScraper> = {
  'iron-horse': () => new IronHorseScraper(),
  'the-drake': () => new TheDrakeScraper(),
  'new-city-brewery': () => new NewCityBreweryScraper(),
  'haze': () => new HazeScraper(),
  'parlor-room': () => new ParlorRoomScraper(),
  'de-la-luz': () => new DeLaLuzScraper(),
  'marigold-theater': () => new MarigoldScraper(),
  'progression-brewing': () => new ProgressionBrewingScraper(),
  'stone-church': () => new StoneChurchScraper(),
  'marigold-brattleboro': () => new MarigoldBrattleboroScraper(),
}

// Export list of venue slugs that have hardcoded scrapers
export const hardcodedScraperSlugs = Object.keys(scraperRegistry)

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { venueSlug } = body

  if (!venueSlug) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: venueSlug',
    })
  }

  const scraperFactory = scraperRegistry[venueSlug]
  if (!scraperFactory) {
    throw createError({
      statusCode: 404,
      message: `No hardcoded scraper found for venue: ${venueSlug}`,
    })
  }

  // Get venue from database
  const venue = await prisma.venue.findFirst({
    where: { slug: venueSlug },
    include: { region: true },
  })

  if (!venue) {
    throw createError({
      statusCode: 404,
      message: `Venue not found: ${venueSlug}`,
    })
  }

  try {
    const scraper = scraperFactory()
    console.log(`[RUN-HARDCODED] Starting scraper for ${venue.name}`)

    const startTime = Date.now()
    const result = await scraper.scrape()
    const executionTime = Date.now() - startTime

    if (!result.success) {
      console.error('[RUN-HARDCODED] Scraper failed:', result.errors)
      return {
        success: false,
        error: result.errors.join(', '),
        executionTime,
      }
    }

    // Get or create a source for tracking
    let source = await prisma.source.findFirst({
      where: {
        type: 'SCRAPER',
        name: { contains: venue.name },
      },
    })

    if (!source) {
      // Create a source record for this hardcoded scraper
      source = await prisma.source.create({
        data: {
          name: `${venue.name} (Hardcoded)`,
          slug: `${venue.slug}-hardcoded`,
          type: 'SCRAPER',
          website: scraper.config.url,
          isActive: true,
          priority: scraper.config.priority || 10,
          config: {
            venueId: venue.id,
            venueSlug: venue.slug,
            hardcoded: true,
          },
        },
      })
    }

    // Save events
    const venueData = { id: venue.id, regionId: venue.regionId }
    const sourceData = { id: source.id, priority: source.priority }

    const saveResult = await saveScrapedEvents(
      prisma,
      result.events,
      venueData,
      sourceData,
      scraper.config.defaultAgeRestriction
    )

    // Classify newly saved events
    await classifyPendingEvents(prisma)

    // Update source last run
    await prisma.source.update({
      where: { id: source.id },
      data: { lastRunAt: new Date(), lastRunStatus: 'success' },
    })

    console.log(`[RUN-HARDCODED] Completed: ${result.events.length} events, saved ${saveResult.saved}, updated ${saveResult.updated}, canceled ${saveResult.canceled}`)

    return {
      success: true,
      eventCount: result.events.length,
      savedCount: saveResult.saved,
      skippedCount: saveResult.skipped,
      updatedCount: saveResult.updated,
      filteredCount: saveResult.filtered,
      canceledCount: saveResult.canceled,
      executionTime,
    }
  } catch (error) {
    console.error('[RUN-HARDCODED] Error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to run scraper',
    })
  }
})
