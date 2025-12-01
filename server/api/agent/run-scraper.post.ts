/**
 * Run an approved scraper to fetch events
 * POST /api/agent/run-scraper
 */

import prisma from '../../utils/prisma'
import { executeScraperCode } from '../../services/agent/executor'
import { saveScrapedEvents } from '../../scrapers/save-events'
import { classifyPendingEvents } from '../../scrapers/classify-events'
import type { ScrapedEvent } from '../../scrapers/types'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { sourceId, saveEvents = true } = body

  if (!sourceId) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: sourceId',
    })
  }

  // Get source with config
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
  })

  if (!source) {
    throw createError({
      statusCode: 404,
      message: 'Source not found',
    })
  }

  const config = source.config as any
  if (!config?.generatedCode) {
    throw createError({
      statusCode: 400,
      message: 'Source does not have generated scraper code',
    })
  }

  // Get venue from config
  const venueId = config.venueId
  if (!venueId) {
    throw createError({
      statusCode: 400,
      message: 'Source config missing venueId. Please re-approve the scraper.',
    })
  }

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: { region: true },
  })

  if (!venue) {
    throw createError({
      statusCode: 404,
      message: 'Venue not found',
    })
  }

  try {
    // Execute the scraper with longer timeout for full runs
    const result = await executeScraperCode(
      config.generatedCode,
      source.website || config.url || '',
      'America/New_York', // TODO: Get timezone from venue/region
      180000 // 3 minute timeout for full scraper runs
    )

    if (!result.success) {
      console.error('[RUN-SCRAPER] Execution failed:', result.error)

      await prisma.source.update({
        where: { id: sourceId },
        data: { lastRunAt: new Date(), lastRunStatus: 'failed' },
      })

      return {
        success: false,
        error: result.error,
        executionTime: result.executionTime,
      }
    }

    const scrapedEvents: ScrapedEvent[] = result.data || []

    let savedCount = 0
    let skippedCount = 0

    if (saveEvents && scrapedEvents.length > 0) {
      const venueData = { id: venue.id, regionId: venue.regionId }
      const sourceData = { id: source.id, priority: source.priority }

      const saveResult = await saveScrapedEvents(prisma, scrapedEvents, venueData, sourceData)
      savedCount = saveResult.saved
      skippedCount = saveResult.skipped

      // Classify newly saved events
      await classifyPendingEvents(prisma)
    }

    await prisma.source.update({
      where: { id: sourceId },
      data: { lastRunAt: new Date(), lastRunStatus: 'success' },
    })

    return {
      success: true,
      eventCount: scrapedEvents.length,
      savedCount,
      skippedCount,
      events: scrapedEvents,
      executionTime: result.executionTime,
    }
  } catch (error) {
    console.error('[RUN-SCRAPER] Error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to run scraper',
    })
  }
})
