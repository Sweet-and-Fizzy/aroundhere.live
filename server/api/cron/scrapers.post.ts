/**
 * Cron endpoint for running all scrapers
 * POST /api/cron/scrapers
 *
 * Add to server crontab:
 *   Run all scrapers daily at 4am: 0 4 * * * curl -sX POST http://localhost:3000/api/cron/scrapers
 */

import prisma from '../../utils/prisma'
import { executeScraperCode } from '../../services/agent/executor'
import { saveScrapedEvents } from '../../scrapers/save-events'
import { classifyPendingEvents } from '../../scrapers/classify-events'
import type { ScrapedEvent } from '../../scrapers/types'

// Import hardcoded scrapers
import { scrapeFreakscene } from '../../scrapers/reviews/freakscene'
import { notifyNewReviews } from '../../services/notifications'
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

interface ScraperResult {
  name: string
  success: boolean
  eventsFound: number
  eventsSaved: number
  eventsSkipped: number
  duration: number
  error?: string
}

export default defineEventHandler(async () => {
  const start = Date.now()
  const results: ScraperResult[] = []

  console.log('[Cron] Starting scraper run...')

  // 1. Run hardcoded scrapers
  const hardcodedScrapers = [
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

  for (const scraper of hardcodedScrapers) {
    const scraperStart = Date.now()
    try {
      const result = await scraper.scrape()

      if (result.success) {
        // Get source for saving
        const source = await prisma.source.findUnique({
          where: { slug: scraper.config.id },
        })
        const venue = await prisma.venue.findFirst({
          where: { slug: scraper.config.venueSlug },
        })

        if (source && venue) {
          const saveResult = await saveScrapedEvents(
            prisma,
            result.events,
            { id: venue.id, regionId: venue.regionId },
            { id: source.id, priority: source.priority }
          )

          results.push({
            name: scraper.config.name,
            success: true,
            eventsFound: result.events.length,
            eventsSaved: saveResult.saved,
            eventsSkipped: saveResult.skipped,
            eventsCanceled: saveResult.canceled,
            duration: Date.now() - scraperStart,
          })
        }
      } else {
        results.push({
          name: scraper.config.name,
          success: false,
          eventsFound: 0,
          eventsSaved: 0,
          eventsSkipped: 0,
          eventsCanceled: 0,
          duration: Date.now() - scraperStart,
          error: result.error,
        })
      }
    } catch (error) {
      results.push({
        name: scraper.config.name,
        success: false,
        eventsFound: 0,
        eventsSaved: 0,
        eventsSkipped: 0,
        eventsCanceled: 0,
        duration: Date.now() - scraperStart,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // 2. Run AI-generated scrapers
  const aiSources = await prisma.source.findMany({
    where: {
      isActive: true,
      config: { not: null },
    },
  })

  for (const source of aiSources) {
    const config = source.config as Record<string, unknown> | null
    if (!config?.generatedCode || !config?.venueId) continue

    const scraperStart = Date.now()
    try {
      const venue = await prisma.venue.findUnique({
        where: { id: config.venueId },
      })
      if (!venue) continue

      const result = await executeScraperCode(
        config.generatedCode,
        source.website || config.url || '',
        'America/New_York',
        180000
      )

      if (result.success) {
        const events: ScrapedEvent[] = result.data || []
        const saveResult = await saveScrapedEvents(
          prisma,
          events,
          { id: venue.id, regionId: venue.regionId },
          { id: source.id, priority: source.priority }
        )

        await prisma.source.update({
          where: { id: source.id },
          data: { lastRunAt: new Date(), lastRunStatus: 'success' },
        })

        results.push({
          name: source.name,
          success: true,
          eventsFound: events.length,
          eventsSaved: saveResult.saved,
          eventsSkipped: saveResult.skipped,
          eventsCanceled: saveResult.canceled,
          duration: Date.now() - scraperStart,
        })
      } else {
        await prisma.source.update({
          where: { id: source.id },
          data: { lastRunAt: new Date(), lastRunStatus: 'failed' },
        })

        results.push({
          name: source.name,
          success: false,
          eventsFound: 0,
          eventsSaved: 0,
          eventsSkipped: 0,
          eventsCanceled: 0,
          duration: Date.now() - scraperStart,
          error: result.error,
        })
      }
    } catch (error) {
      results.push({
        name: source.name,
        success: false,
        eventsFound: 0,
        eventsSaved: 0,
        eventsSkipped: 0,
        eventsCanceled: 0,
        duration: Date.now() - scraperStart,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // 3. Scrape review sources
  let reviewStats = { newReviews: 0, artistMatches: 0, duration: 0 }
  const reviewStart = Date.now()
  try {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY
    if (anthropicApiKey) {
      const reviewResult = await scrapeFreakscene(prisma, anthropicApiKey)
      reviewStats = { ...reviewResult, duration: Date.now() - reviewStart }
      console.log(`[Cron] Freakscene: ${reviewResult.newReviews} new reviews, ${reviewResult.artistMatches} artist matches`)

      // Notify about new reviews with artist matches
      await notifyNewReviews({
        source: 'Freakscene',
        newReviews: reviewResult.newReviews,
        artistMatches: reviewResult.artistMatches,
      })
    }
  } catch (error) {
    console.error('[Cron] Freakscene scraper error:', error instanceof Error ? error.message : error)
  }

  // 4. Classify any new events
  await classifyPendingEvents(prisma)

  const totalDuration = Date.now() - start
  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const totalSaved = results.reduce((sum, r) => sum + r.eventsSaved, 0)

  console.log(`[Cron] Scraper run complete: ${successful} succeeded, ${failed} failed, ${totalSaved} events saved in ${totalDuration}ms`)

  return {
    timestamp: new Date().toISOString(),
    duration: totalDuration,
    summary: {
      total: results.length,
      successful,
      failed,
      eventsSaved: totalSaved,
    },
    reviews: reviewStats,
    results,
  }
})
