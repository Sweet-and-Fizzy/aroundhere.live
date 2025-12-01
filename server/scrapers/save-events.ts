/**
 * Event saving utilities
 * Extracted from runner.ts for reuse by AI-generated scrapers
 */

import type { PrismaClient, Prisma } from '@prisma/client'
import type { ScrapedEvent } from './types'
import { findDuplicate, mergeEventData } from './dedup'
import {
  decodeHtmlEntities,
  processDescriptions,
  generateSlug,
} from '../utils/html'

/**
 * Save a single scraped event to the database with deduplication
 * Returns true if a new event was created, false if updated/skipped
 */
export async function saveEvent(
  prisma: PrismaClient,
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
      const descriptions = processDescriptions(scrapedEvent.description, scrapedEvent.descriptionHtml)
      await prisma.event.update({
        where: { id: existingFromSameSource.id },
        data: {
          title: decodeHtmlEntities(scrapedEvent.title),
          description: descriptions.description,
          descriptionHtml: descriptions.descriptionHtml,
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
    console.log(`[SaveEvent] Found duplicate: "${scrapedEvent.title}" matches existing event (similarity: ${dedupResult.similarity.toFixed(2)})`)

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
        rawData: scrapedEvent as unknown as Prisma.InputJsonValue,
      },
      create: {
        eventId: dedupResult.existingEventId,
        sourceId: source.id,
        sourceUrl: scrapedEvent.sourceUrl,
        sourceEventId: scrapedEvent.sourceEventId,
        rawData: scrapedEvent as unknown as Prisma.InputJsonValue,
      },
    })

    if (dedupResult.shouldUpdateCanonical) {
      // This source has higher priority, update the canonical event
      console.log(`[SaveEvent] Updating canonical source (higher priority)`)
      const canonicalDescriptions = processDescriptions(scrapedEvent.description, scrapedEvent.descriptionHtml)
      await prisma.event.update({
        where: { id: dedupResult.existingEventId },
        data: {
          sourceId: source.id,
          sourceEventId: scrapedEvent.sourceEventId,
          sourceUrl: scrapedEvent.sourceUrl,
          title: decodeHtmlEntities(scrapedEvent.title),
          description: canonicalDescriptions.description,
          descriptionHtml: canonicalDescriptions.descriptionHtml,
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

  // Process descriptions - preserve HTML in descriptionHtml, clean text in description
  const newDescriptions = processDescriptions(scrapedEvent.description, scrapedEvent.descriptionHtml)

  // Create new event
  const event = await prisma.event.create({
    data: {
      regionId: venue.regionId,
      venueId: venue.id,
      title: decodeHtmlEntities(scrapedEvent.title),
      slug,
      description: newDescriptions.description,
      descriptionHtml: newDescriptions.descriptionHtml,
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
      rawData: scrapedEvent as unknown as Prisma.InputJsonValue,
    },
  })

  return true // New event created
}

/**
 * Save multiple scraped events and return counts
 */
export async function saveScrapedEvents(
  prisma: PrismaClient,
  events: ScrapedEvent[],
  venue: { id: string; regionId: string },
  source: { id: string; priority: number },
  defaultAgeRestriction?: 'ALL_AGES' | 'EIGHTEEN_PLUS' | 'TWENTY_ONE_PLUS'
): Promise<{ saved: number; skipped: number }> {
  let saved = 0
  let skipped = 0

  for (const event of events) {
    try {
      const isNew = await saveEvent(prisma, event, venue, source, defaultAgeRestriction)
      if (isNew) {
        saved++
      } else {
        skipped++
      }
    } catch (error) {
      console.error(`[SaveEvent] Error saving event: ${event.title}`, error)
      skipped++
    }
  }

  return { saved, skipped }
}

