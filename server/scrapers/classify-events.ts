/**
 * Event classification utilities
 * Classifies unclassified events using the AI classifier service
 * Also generates embeddings for semantic similarity search
 */

import type { PrismaClient } from '@prisma/client'
import { classifier } from '../services/classifier'
import type { ClassificationInput } from '../services/classifier/types'
import { generateEmbeddings, buildEventEmbeddingText } from '../services/embeddings'
import { sendSlackNotification } from '../services/notifications'

const BATCH_SIZE = 20
const MAX_CLASSIFICATION_ATTEMPTS = 3

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

    const inputs: ClassificationInput[] = unclassified.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      venueName: e.venue?.name,
      existingTags: e.genres,
    }))

    try {
      const results = await classifier.classifyWithFallback(inputs)

      // Build embedding texts for events that are music (we care about similarity for music events)
      const musicResults = results.filter(r => r.isMusic)
      const embeddingTexts = musicResults.map(result => {
        const event = unclassified.find(e => e.id === result.eventId)!
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
        reviewStatus: 'NEEDS_REVIEW',
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

  return {
    total: totalClassified,
    music: totalMusic,
    nonMusic: totalClassified - totalMusic,
    failed: totalFailed,
  }
}
