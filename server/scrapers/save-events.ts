/**
 * Event saving utilities
 * Extracted from runner.ts for reuse by AI-generated scrapers
 */

import type { PrismaClient, Prisma } from '@prisma/client'
import type { ScrapedEvent } from './types'
import { findDuplicate, mergeEventData } from './dedup'
import {
  decodeHtmlEntities,
  cleanEventTitle,
  processDescriptions,
  generateSlug,
  normalizeForComparison,
} from '../utils/html'
import { extractAndLinkArtist } from '../utils/artist-extraction'
import { notifyScraperAnomaly } from '../services/notifications'
import { similarityScore } from './dedup'

// Threshold for detecting suspicious duplicates
const DUPLICATE_SIMILARITY_THRESHOLD = 0.7

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

export type SaveEventResult = 'created' | 'updated' | 'skipped'

/**
 * Save a single scraped event to the database with deduplication
 * Returns 'created' for new events, 'updated' for updated events, 'skipped' for no changes
 */
export async function saveEvent(
  prisma: PrismaClient,
  scrapedEvent: ScrapedEvent,
  venue: { id: string; regionId: string },
  source: { id: string; priority: number },
  defaultAgeRestriction?: 'ALL_AGES' | 'EIGHTEEN_PLUS' | 'TWENTY_ONE_PLUS'
): Promise<SaveEventResult> {
  // Auto-generate sourceEventId from sourceUrl if not provided
  // This is critical for the cancellation logic to work properly
  const sourceEventId = scrapedEvent.sourceEventId || scrapedEvent.sourceUrl || null

  // First, check if this exact source already has this event (by source + sourceEventId)
  if (sourceEventId) {
    const existingFromSameSource = await prisma.event.findFirst({
      where: {
        sourceId: source.id,
        sourceEventId: sourceEventId,
      },
    })

    if (existingFromSameSource) {
      // Update existing event from same source
      const descriptions = processDescriptions(scrapedEvent.description)
      // Clean title after deduplication to avoid breaking matching
      const cleanedTitle = cleanEventTitle(decodeHtmlEntities(scrapedEvent.title))
      await prisma.event.update({
        where: { id: existingFromSameSource.id },
        data: {
          title: cleanedTitle,
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
      return 'updated'
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
        sourceEventId: sourceEventId,
        scrapedAt: new Date(),
        rawData: scrapedEvent as unknown as Prisma.InputJsonValue,
      },
      create: {
        eventId: dedupResult.existingEventId,
        sourceId: source.id,
        sourceUrl: scrapedEvent.sourceUrl,
        sourceEventId: sourceEventId,
        rawData: scrapedEvent as unknown as Prisma.InputJsonValue,
      },
    })

    if (dedupResult.shouldUpdateCanonical) {
      // Same source re-scrape or higher priority source - update the canonical event
      console.log(`[SaveEvent] Updating canonical event (same source or higher priority)`)
      const canonicalDescriptions = processDescriptions(scrapedEvent.description)
      // Clean title after deduplication to avoid breaking matching
      const cleanedTitle = cleanEventTitle(decodeHtmlEntities(scrapedEvent.title))
      await prisma.event.update({
        where: { id: dedupResult.existingEventId },
        data: {
          sourceId: source.id,
          sourceEventId: sourceEventId,
          sourceUrl: scrapedEvent.sourceUrl,
          title: cleanedTitle,
          description: canonicalDescriptions.description,
          descriptionHtml: canonicalDescriptions.descriptionHtml,
          imageUrl: scrapedEvent.imageUrl,
          coverCharge: scrapedEvent.coverCharge,
          ticketUrl: scrapedEvent.ticketUrl,
          genres: scrapedEvent.genres || [],
          updatedAt: new Date(),
        },
      })
      return 'updated'
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
          return 'updated'
        }
      }
    }

    return 'skipped' // Duplicate with no changes needed
  }

  // Clean title after deduplication and before saving
  // Use original title for artist extraction to preserve artist names
  const cleanedTitle = cleanEventTitle(decodeHtmlEntities(scrapedEvent.title))

  // Generate slug from cleaned title
  const slug = generateSlug(cleanedTitle, scrapedEvent.startsAt)

  // Process descriptions - preserve HTML in descriptionHtml, clean text in description
  const newDescriptions = processDescriptions(scrapedEvent.description)

  // Create new event
  const event = await prisma.event.create({
    data: {
      regionId: venue.regionId,
      venueId: venue.id,
      title: cleanedTitle,
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
      sourceEventId: sourceEventId,
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
      sourceEventId: sourceEventId,
      rawData: scrapedEvent as unknown as Prisma.InputJsonValue,
    },
  })

  // Extract and link artist from ORIGINAL title (before cleaning) to preserve artist names
  await extractAndLinkArtist(prisma, event.id, scrapedEvent.title)

  return 'created'
}

/**
 * Check if an event date is valid (not too far in future, not in past)
 * Also attempts to correct year inference errors from scrapers.
 *
 * Common problem: Scrapers see "January 15" and assign current year (2025),
 * but if we're in December 2025, it should be January 2026.
 *
 * We're conservative about corrections to avoid pushing stale listings to next year.
 * Only correct dates where the month is 1-3 months "ahead" of current month.
 * e.g., In December, only correct January/February/March dates.
 */
function isValidEventDate(startsAt: Date): { valid: boolean; reason?: string; correctedDate?: Date } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eventDate = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate())

  const msPerDay = 1000 * 60 * 60 * 24
  const daysFromNow = (eventDate.getTime() - today.getTime()) / msPerDay

  // Helper: Check if event month is 1-3 months "ahead" of current month (with year wrap)
  // e.g., in December (11), January (0), February (1), March (2) are "ahead"
  const isMonthSlightlyAhead = () => {
    const currentMonth = now.getMonth()
    const eventMonth = startsAt.getMonth()
    // Calculate how many months ahead the event is (with wrap-around)
    const monthsAhead = (eventMonth - currentMonth + 12) % 12
    return monthsAhead >= 1 && monthsAhead <= 3
  }

  // Event is in the future
  if (daysFromNow >= 0) {
    // Check if it's too far in the future (>10 months ≈ 300 days)
    if (daysFromNow > 300) {
      // Try subtracting a year - maybe scraper incorrectly pushed to next year
      const correctedDate = new Date(startsAt)
      correctedDate.setFullYear(correctedDate.getFullYear() - 1)
      const correctedDaysFromNow = (correctedDate.getTime() - today.getTime()) / msPerDay

      // If corrected date is in reasonable range (-14 to 300 days), use it
      // We allow slightly past dates here since a Nov event might be just past
      if (correctedDaysFromNow >= -14 && correctedDaysFromNow <= 300) {
        return { valid: true, correctedDate }
      }

      return { valid: false, reason: 'too far in future (>10 months)' }
    }

    return { valid: true }
  }

  // Event is in the past
  const daysInPast = -daysFromNow

  // Recently past (within 2 weeks) - genuinely past event, don't correct
  if (daysInPast <= 14) {
    return { valid: false, reason: 'past event (recent)' }
  }

  // Only attempt year correction if the month is 1-3 months "ahead" of current month
  // This avoids pushing stale listings (e.g., March event still on calendar in December)
  // to next year. We only correct dates that look like year-wrap issues.
  if (isMonthSlightlyAhead()) {
    const correctedDate = new Date(startsAt)
    correctedDate.setFullYear(correctedDate.getFullYear() + 1)
    const correctedDaysFromNow = (correctedDate.getTime() - today.getTime()) / msPerDay

    // If corrected date is in reasonable future range (0-120 days / ~4 months), use it
    if (correctedDaysFromNow >= 0 && correctedDaysFromNow <= 120) {
      return { valid: true, correctedDate }
    }
  }

  return { valid: false, reason: 'past event' }
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
): Promise<{ saved: number; skipped: number; updated: number; filtered: number; canceled: number }> {
  let saved = 0
  let skipped = 0
  let updated = 0
  let filtered = 0

  // Track sourceEventIds for cancellation detection
  const scrapedSourceEventIds: string[] = []

  for (const event of events) {
    try {
      // Validate event date (may return corrected date for year inference errors)
      const dateCheck = isValidEventDate(event.startsAt)
      if (!dateCheck.valid) {
        console.log(`[SaveEvent] Filtering out "${event.title}": ${dateCheck.reason}`)
        filtered++
        continue
      }

      // Apply date correction if the validator detected a year inference error
      let eventWithCorrectedDate = event
      if (dateCheck.correctedDate) {
        console.log(`[SaveEvent] Correcting year for "${event.title}": ${event.startsAt.toISOString().split('T')[0]} -> ${dateCheck.correctedDate.toISOString().split('T')[0]}`)
        eventWithCorrectedDate = { ...event, startsAt: dateCheck.correctedDate }
      }

      // Always generate a composite key if scraper doesn't provide sourceEventId.
      // This ensures proper deduplication even when fuzzy matching would catch it,
      // by allowing exact ID matching which is more reliable.
      const eventToSave = !eventWithCorrectedDate.sourceEventId
        ? { ...eventWithCorrectedDate, sourceEventId: generateCompositeKey(venue.id, eventWithCorrectedDate) }
        : eventWithCorrectedDate

      // Track the sourceEventId for cancellation detection
      // Use sourceUrl as fallback since some scrapers don't provide explicit IDs
      const trackingId = eventToSave.sourceEventId || eventToSave.sourceUrl
      if (trackingId) {
        scrapedSourceEventIds.push(trackingId)
      }

      const result = await saveEvent(prisma, eventToSave, venue, source, defaultAgeRestriction)
      console.log(`[SaveEvent] "${eventToSave.title}" -> ${result}`)
      if (result === 'created') {
        saved++
      } else if (result === 'updated') {
        updated++
      } else {
        skipped++
      }
    } catch (error) {
      console.error(`[SaveEvent] Error saving event: ${event.title}`, error)
      skipped++
    }
  }

  // Mark events that are no longer listed as canceled
  // Safety: Only run cancellation if we found a reasonable number of events
  // This prevents mass cancellation when a scraper fails to load the page
  let canceled = 0
  if (scrapedSourceEventIds.length >= 3) {
    canceled = await markMissingEventsAsCanceled(
      prisma,
      scrapedSourceEventIds,
      source.id,
      venue.id
    )
  } else if (scrapedSourceEventIds.length === 0) {
    console.log(`[SaveEvent] Skipping cancellation check - no events scraped (scraper may have failed)`)
  } else {
    console.log(`[SaveEvent] Skipping cancellation check - only ${scrapedSourceEventIds.length} events scraped (below threshold)`)
  }

  console.log(`[SaveEvent] Summary: saved=${saved}, updated=${updated}, skipped=${skipped}, filtered=${filtered}, canceled=${canceled}`)
  return { saved, skipped, updated, filtered, canceled }
}

/**
 * Metadata about the source for anomaly detection/alerting
 */
export interface SourceMetadata {
  sourceId: string
  sourceName: string
  venueName: string
}

/**
 * Detect suspicious duplicates created by a scraper run.
 * Looks for events just created that have similar titles to pre-existing events
 * at the same venue on the same day.
 *
 * Returns list of potential duplicate pairs for alerting.
 */
export async function detectSuspiciousDuplicates(
  prisma: PrismaClient,
  sourceId: string,
  venueId: string,
  runStartTime: Date
): Promise<Array<{ newEvent: { id: string; title: string; startsAt: Date }; existingEvent: { id: string; title: string; startsAt: Date }; similarity: number }>> {
  // Find events created by this source during this run
  const newEvents = await prisma.event.findMany({
    where: {
      sourceId,
      venueId,
      createdAt: { gte: runStartTime },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
    },
  })

  if (newEvents.length === 0) {
    return []
  }

  const suspiciousPairs: Array<{
    newEvent: { id: string; title: string; startsAt: Date }
    existingEvent: { id: string; title: string; startsAt: Date }
    similarity: number
  }> = []

  // For each new event, check if there's a similar pre-existing event
  for (const newEvent of newEvents) {
    const startOfDay = new Date(newEvent.startsAt)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(newEvent.startsAt)
    endOfDay.setHours(23, 59, 59, 999)

    // Find pre-existing events at same venue on same day
    const existingEvents = await prisma.event.findMany({
      where: {
        venueId,
        id: { not: newEvent.id },
        startsAt: { gte: startOfDay, lte: endOfDay },
        createdAt: { lt: runStartTime }, // Created before this run
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
      },
    })

    // Check title similarity
    for (const existing of existingEvents) {
      const similarity = similarityScore(newEvent.title, existing.title)
      if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
        suspiciousPairs.push({
          newEvent,
          existingEvent: existing,
          similarity,
        })
      }
    }
  }

  return suspiciousPairs
}

/**
 * Handle detected duplicates: pause notifications for source and alert admins
 */
export async function handleSuspiciousDuplicates(
  prisma: PrismaClient,
  sourceMetadata: SourceMetadata,
  duplicates: Array<{ newEvent: { id: string; title: string; startsAt: Date }; existingEvent: { id: string; title: string; startsAt: Date }; similarity: number }>
): Promise<void> {
  if (duplicates.length === 0) {
    return
  }

  const reason = `Detected ${duplicates.length} potential duplicate event(s) that should have matched existing events`

  // Pause notifications for this source
  await prisma.source.update({
    where: { id: sourceMetadata.sourceId },
    data: {
      notificationsPaused: true,
      notificationsPausedAt: new Date(),
      notificationsPausedReason: reason,
    },
  })

  console.log(`[SaveEvent] Paused notifications for source ${sourceMetadata.sourceName}: ${reason}`)

  // Build sample titles for alert
  const sampleTitles = duplicates.slice(0, 5).map(d =>
    `"${d.newEvent.title}" ≈ "${d.existingEvent.title}" (${(d.similarity * 100).toFixed(0)}%)`
  )

  // Alert admins
  await notifyScraperAnomaly({
    sourceId: sourceMetadata.sourceId,
    sourceName: sourceMetadata.sourceName,
    venueName: sourceMetadata.venueName,
    anomalyType: 'duplicate_spike',
    severity: duplicates.length >= 3 ? 'critical' : 'warning',
    message: reason,
    details: {
      eventsCreated: duplicates.length,
      eventsUpdated: 0,
      eventsSkipped: 0,
      sampleTitles,
      timestamp: new Date(),
    },
  })
}

