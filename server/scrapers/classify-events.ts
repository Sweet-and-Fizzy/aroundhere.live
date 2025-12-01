/**
 * Event classification utilities
 * Classifies unclassified events using the AI classifier service
 */

import type { PrismaClient } from '@prisma/client'
import { classifier } from '../services/classifier'
import type { ClassificationInput } from '../services/classifier/types'

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
