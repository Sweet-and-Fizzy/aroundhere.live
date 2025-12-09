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
  normalizeForComparison,
} from '../utils/html'
import { extractAndLinkArtist } from '../utils/artist-extraction'

/**
 * Generate a composite key for event uniqueness when sourceUrl is not unique.
 * Uses venueId + date + time + normalized title to identify unique events.
 */
function generateCompositeKey(venueId: string, event: ScrapedEvent): string {
  const date = event.startsAt.toISOString().split('T')[0] // YYYY-MM-DD
  const time = event.startsAt.toTimeString().slice(0, 5) // HH:MM (24h format)
  const title = normalizeForComparison(event.title)
  return `${venueId}:${date}:${time}:${title}`
}

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
      const descriptions = processDescriptions(scrapedEvent.description)
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
          // If event reappears after being marked canceled, uncancel it
          isCancelled: false,
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
      const canonicalDescriptions = processDescriptions(scrapedEvent.description)
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
  const newDescriptions = processDescriptions(scrapedEvent.description)

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

  // Extract and link artist from title
  await extractAndLinkArtist(prisma, event.id, scrapedEvent.title)

  return true // New event created
}

/**
 * Check if an event date is valid (not too far in future, not in past)
 * This catches cases where scraper incorrectly assumes next year for stale listings
 */
function isValidEventDate(startsAt: Date): { valid: boolean; reason?: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Skip events in the past
  if (startsAt < today) {
    return { valid: false, reason: 'past event' }
  }

  // Skip events more than 10 months in the future
  // This catches stale November listings being interpreted as next year when it's December
  const maxFutureDate = new Date(now)
  maxFutureDate.setMonth(maxFutureDate.getMonth() + 10)

  if (startsAt > maxFutureDate) {
    return { valid: false, reason: 'too far in future (>10 months)' }
  }

  return { valid: true }
}

/**
 * Mark events as canceled if they're no longer listed by their source.
 * Only affects future events from this specific source.
 * Returns the number of events marked as canceled.
 */
export async function markMissingEventsAsCanceled(
  prisma: PrismaClient,
  scrapedEventIds: string[],
  sourceId: string,
  venueId: string
): Promise<number> {
  const now = new Date()

  // Find future events from this source/venue that weren't in the scraped list
  const missingEvents = await prisma.event.findMany({
    where: {
      sourceId,
      venueId,
      startsAt: { gte: now },
      isCancelled: false,
      // Only consider events that have a sourceEventId (so we can match them)
      sourceEventId: {
        notIn: scrapedEventIds.filter(Boolean),
        not: null,
      },
    },
    select: { id: true, title: true, startsAt: true },
  })

  if (missingEvents.length === 0) {
    return 0
  }

  console.log(`[SaveEvent] Marking ${missingEvents.length} missing events as canceled:`)
  for (const event of missingEvents) {
    console.log(`  - "${event.title}" (${event.startsAt.toISOString().split('T')[0]})`)
  }

  // Mark them as canceled
  await prisma.event.updateMany({
    where: {
      id: { in: missingEvents.map(e => e.id) },
    },
    data: {
      isCancelled: true,
      updatedAt: new Date(),
    },
  })

  return missingEvents.length
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
): Promise<{ saved: number; skipped: number; filtered: number; canceled: number }> {
  let saved = 0
  let skipped = 0
  let filtered = 0

  // Detect if sourceUrls are non-unique (e.g., scraper returns listing page URL for all events)
  const urlCounts: Record<string, number> = {}
  for (const event of events) {
    if (event.sourceUrl) {
      urlCounts[event.sourceUrl] = (urlCounts[event.sourceUrl] || 0) + 1
    }
  }
  const hasNonUniqueUrls = Object.values(urlCounts).some(count => count > 1)

  if (hasNonUniqueUrls) {
    console.log(`[SaveEvent] Detected non-unique sourceUrls, will use composite keys for events without sourceEventId`)
  }

  // Track sourceEventIds for cancellation detection
  const scrapedSourceEventIds: string[] = []

  for (const event of events) {
    try {
      // Validate event date
      const dateCheck = isValidEventDate(event.startsAt)
      if (!dateCheck.valid) {
        console.log(`[SaveEvent] Filtering out "${event.title}": ${dateCheck.reason}`)
        filtered++
        continue
      }

      // If sourceUrls are non-unique AND scraper doesn't provide its own sourceEventId,
      // generate a composite key. Don't override scraper-provided IDs.
      const eventToSave = hasNonUniqueUrls && !event.sourceEventId
        ? { ...event, sourceEventId: generateCompositeKey(venue.id, event) }
        : event

      // Track the sourceEventId for cancellation detection
      if (eventToSave.sourceEventId) {
        scrapedSourceEventIds.push(eventToSave.sourceEventId)
      }

      const isNew = await saveEvent(prisma, eventToSave, venue, source, defaultAgeRestriction)
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

  // Mark events that are no longer listed as canceled
  const canceled = await markMissingEventsAsCanceled(
    prisma,
    scrapedSourceEventIds,
    source.id,
    venue.id
  )

  return { saved, skipped, filtered, canceled }
}

