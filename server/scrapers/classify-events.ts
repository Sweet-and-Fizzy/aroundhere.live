/**
 * Event classification utilities
 * Classifies unclassified events using the AI classifier service
 * Also generates embeddings for semantic similarity search
 */

import type { PrismaClient } from '@prisma/client'
import { classifier } from '../services/classifier'
import type { ClassificationInput } from '../services/classifier/types'
import { generateEmbeddings, buildEventEmbeddingText } from '../services/embeddings'

const BATCH_SIZE = 20

/**
 * Classify all pending (unclassified) events in batches
 * Returns the total number of events classified
 */
export async function classifyPendingEvents(
  prisma: PrismaClient
): Promise<{ total: number; music: number; nonMusic: number }> {
  let totalClassified = 0
  let totalMusic = 0

  while (true) {
    const unclassified = await prisma.event.findMany({
      where: {
        isMusic: null,
        startsAt: { gte: new Date() },
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
      // Continue with next batch instead of stopping entirely
    }
  }

  if (totalClassified > 0) {
    console.log(`[Classify] Complete: ${totalClassified} total (${totalMusic} music, ${totalClassified - totalMusic} non-music)`)
  }

  return {
    total: totalClassified,
    music: totalMusic,
    nonMusic: totalClassified - totalMusic,
  }
}
