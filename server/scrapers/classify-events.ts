/**
 * Event classification utilities
 * Classifies unclassified events using the AI classifier service
 * Also generates embeddings for semantic similarity search
 */

import type { PrismaClient } from '@prisma/client'
import { classifier } from '../services/classifier'
import type { ClassificationInput, ClassificationResult } from '../services/classifier/types'
import { generateEmbeddings, buildEventEmbeddingText } from '../services/embeddings'
import { sendSlackNotification } from '../services/notifications'

const BATCH_SIZE = 20
const MAX_CLASSIFICATION_ATTEMPTS = 3
const SUMMARY_BACKFILL_LIMIT = 100

type EventForClassification = {
  id: string
  title: string
  description: string | null
  genres: string[]
  venue: { name: string } | null
}

/**
 * Classify a single event by ID (used when approving community submissions)
 */
export async function classifySingleEvent(
  prisma: PrismaClient,
  eventId: string
): Promise<void> {
  const eventRecord = await prisma.event.findUnique({
    where: { id: eventId },
    include: { venue: { select: { name: true } } },
  })
  if (!eventRecord) return

  const input: ClassificationInput = {
    id: eventRecord.id,
    title: eventRecord.title,
    description: eventRecord.description,
    venueName: eventRecord.venue?.name,
    existingTags: eventRecord.genres,
  }

  try {
    const results = await classifier.classifyWithFallback([input])
    const result = results[0]
    if (!result) return

    // Generate embedding if it's a music event
    let embedding: number[] | null = null
    if (result.isMusic) {
      try {
        const text = buildEventEmbeddingText({
          title: eventRecord.title,
          description: eventRecord.description,
          canonicalGenres: result.canonicalGenres,
          eventType: result.eventType,
        })
        const embeddings = await generateEmbeddings([text])
        embedding = embeddings[0] || null
      } catch (err) {
        console.error('[Classify] Failed to generate embedding for single event:', err)
      }
    }

    if (embedding) {
      await prisma.$executeRawUnsafe(
        `UPDATE events SET
          "isMusic" = $1,
          "eventType" = $2,
          "canonicalGenres" = $3,
          "summary" = $4,
          "classifiedAt" = $5,
          "classificationConfidence" = $6,
          embedding = $7::vector
        WHERE id = $8`,
        result.isMusic,
        result.eventType,
        result.canonicalGenres,
        result.summary,
        new Date(),
        result.confidence,
        `[${embedding.join(',')}]`,
        result.eventId
      )
    } else {
      await prisma.event.update({
        where: { id: result.eventId },
        data: {
          isMusic: result.isMusic,
          eventType: result.eventType,
          canonicalGenres: result.canonicalGenres,
          summary: result.summary,
          classifiedAt: new Date(),
          classificationConfidence: result.confidence,
        },
      })
    }

    console.log(`[Classify] Single event classified: "${eventRecord.title}" → ${result.isMusic ? 'music' : 'non-music'}, type=${result.eventType}, genres=${result.canonicalGenres.join(',')}`)
  } catch (error) {
    console.error(`[Classify] Failed to classify single event "${eventRecord.title}":`, error)
    // Don't throw - approval should still succeed even if classification fails
    // Fall back to isMusic: true so the event at least shows up
    await prisma.event.update({
      where: { id: eventId },
      data: { isMusic: true, eventType: 'MUSIC', classificationConfidence: 0.3 },
    })
    console.warn(`[Classify] Defaulted event "${eventRecord.title}" to music after classification failure`)
  }
}

/**
 * Classify a batch of events and save the results (classification, summary,
 * and embeddings for music events). Throws if the classifier fails.
 */
async function classifyAndSave(
  prisma: PrismaClient,
  events: EventForClassification[]
): Promise<ClassificationResult[]> {
  const inputs: ClassificationInput[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    venueName: e.venue?.name,
    existingTags: e.genres,
  }))

  const results = await classifier.classifyWithFallback(inputs)

  // Build embedding texts for events that are music (we care about similarity for music events)
  const musicResults = results.filter(r => r.isMusic && events.some(e => e.id === r.eventId))
  const embeddingTexts = musicResults.map(result => {
    const event = events.find(e => e.id === result.eventId)!
    return buildEventEmbeddingText({
      title: event.title,
      description: event.description,
      canonicalGenres: result.canonicalGenres,
      eventType: result.eventType,
    })
  })

  // Generate embeddings in batch
  let embeddings: number[][] = []
  if (embeddingTexts.length > 0) {
    try {
      embeddings = await generateEmbeddings(embeddingTexts)
      console.log(`[Classify] Generated ${embeddings.length} embeddings`)
    } catch (embeddingError) {
      console.error('[Classify] Failed to generate embeddings:', embeddingError)
      // Continue without embeddings - they can be backfilled later
    }
  }

  // Update events with classification and embeddings
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (!result) continue
    const musicIndex = musicResults.findIndex(r => r.eventId === result.eventId)
    const embedding = musicIndex >= 0 && embeddings[musicIndex]
      ? embeddings[musicIndex]
      : null

    // Use raw SQL to update embedding since Prisma doesn't support vector type
    if (embedding) {
      await prisma.$executeRawUnsafe(
        `UPDATE events SET
          "isMusic" = $1,
          "eventType" = $2,
          "canonicalGenres" = $3,
          "summary" = $4,
          "classifiedAt" = $5,
          "classificationConfidence" = $6,
          embedding = $7::vector
        WHERE id = $8`,
        result.isMusic,
        result.eventType,
        result.canonicalGenres,
        result.summary,
        new Date(),
        result.confidence,
        `[${embedding.join(',')}]`,
        result.eventId
      )
    } else {
      await prisma.event.update({
        where: { id: result.eventId },
        data: {
          isMusic: result.isMusic,
          eventType: result.eventType,
          canonicalGenres: result.canonicalGenres,
          summary: result.summary,
          classifiedAt: new Date(),
          classificationConfidence: result.confidence,
        },
      })
    }
  }

  return results
}

/**
 * Classify all pending (unclassified) events in batches
 * Returns the total number of events classified
 */
export async function classifyPendingEvents(
  prisma: PrismaClient
): Promise<{ total: number; music: number; nonMusic: number; failed: number }> {
  let totalClassified = 0
  let totalMusic = 0
  let totalFailed = 0

  while (true) {
    const unclassified = await prisma.event.findMany({
      where: {
        isMusic: null,
        startsAt: { gte: new Date() },
        classificationAttempts: { lt: MAX_CLASSIFICATION_ATTEMPTS },
      },
      include: {
        venue: { select: { name: true } },
      },
      take: BATCH_SIZE,
    })

    if (unclassified.length === 0) {
      break
    }

    console.log(`[Classify] Processing batch of ${unclassified.length} events...`)

    try {
      const results = await classifyAndSave(prisma, unclassified)

      const musicCount = results.filter((r) => r.isMusic).length
      totalClassified += results.length
      totalMusic += musicCount
      console.log(`[Classify] Batch done: ${results.length} classified (${musicCount} music)`)
    } catch (error) {
      console.error('[Classify] Batch failed:', error)

      // Increment attempt counter for all events in this batch
      const eventIds = unclassified.map(e => e.id)
      await prisma.event.updateMany({
        where: { id: { in: eventIds } },
        data: { classificationAttempts: { increment: 1 } },
      })
      totalFailed += eventIds.length

      // Continue with next batch instead of stopping entirely
    }
  }

  if (totalClassified > 0) {
    console.log(`[Classify] Complete: ${totalClassified} total (${totalMusic} music, ${totalClassified - totalMusic} non-music)`)
  }

  // Handle events that have hit max attempts - default to showing them
  const stuckEvents = await prisma.event.findMany({
    where: {
      isMusic: null,
      classificationAttempts: { gte: MAX_CLASSIFICATION_ATTEMPTS },
      startsAt: { gte: new Date() },
    },
    select: { id: true, title: true, sourceUrl: true },
  })

  if (stuckEvents.length > 0) {
    // Default stuck events to isMusic: true so they still show up
    // Mark with low confidence and NEEDS_REVIEW status for manual check
    await prisma.event.updateMany({
      where: { id: { in: stuckEvents.map(e => e.id) } },
      data: {
        isMusic: true,
        eventType: 'MUSIC',
        classificationConfidence: 0.3,
        classifiedAt: new Date(),
        reviewStatus: 'FLAGGED',
      },
    })

    console.warn(`[Classify] ${stuckEvents.length} events defaulted to music after max attempts`)

    // Send notification about events that needed manual defaulting
    await sendSlackNotification(
      '⚠️ Event Classification Issues',
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `⚠️ *Event Classification Issues*`,
              '',
              `${stuckEvents.length} events failed classification ${MAX_CLASSIFICATION_ATTEMPTS} times and were defaulted to "music":`,
              '',
              ...stuckEvents.slice(0, 10).map(e => `• <${e.sourceUrl}|${e.title}>`),
              stuckEvents.length > 10 ? `• ... and ${stuckEvents.length - 10} more` : '',
            ].filter(Boolean).join('\n'),
          },
        },
      ]
    )

    totalFailed += stuckEvents.length
  }

  await backfillMissingSummaries(prisma)

  return {
    total: totalClassified,
    music: totalMusic,
    nonMusic: totalClassified - totalMusic,
    failed: totalFailed,
  }
}

/**
 * Re-classify upcoming events that were classified before they had a
 * description. The classifier only writes a summary when there's a description,
 * so a description that arrives later (a scraper fix, a venue updating its page)
 * would otherwise never get one. Events stay visible while this runs. Each one
 * gets at most MAX_CLASSIFICATION_ATTEMPTS tries. Returns the number of summaries written.
 */
export async function backfillMissingSummaries(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM events
    WHERE "isMusic" IS NOT NULL
      AND summary IS NULL
      AND "isCancelled" = false
      AND "startsAt" >= NOW()
      AND length(coalesce(description, '')) >= 40
      AND "classificationAttempts" < ${MAX_CLASSIFICATION_ATTEMPTS}
    ORDER BY "startsAt"
    LIMIT ${SUMMARY_BACKFILL_LIMIT}
  `
  if (rows.length === 0) return 0

  const events = await prisma.event.findMany({
    where: { id: { in: rows.map(r => r.id) } },
    include: { venue: { select: { name: true } } },
  })

  let written = 0
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE)
    let unsummarized = batch.map(e => e.id)
    try {
      const results = await classifyAndSave(prisma, batch)
      const summarized = new Set(results.filter(r => r.summary).map(r => r.eventId))
      written += summarized.size
      unsummarized = unsummarized.filter(id => !summarized.has(id))
    } catch (error) {
      console.error('[Classify] Summary backfill batch failed:', error)
    }
    if (unsummarized.length > 0) {
      await prisma.event.updateMany({
        where: { id: { in: unsummarized } },
        data: { classificationAttempts: { increment: 1 } },
      })
    }
  }

  console.log(`[Classify] Summary backfill: ${written} of ${events.length} events summarized`)
  return written
}
