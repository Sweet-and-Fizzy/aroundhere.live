/**
 * Scraper generation worker
 * Processes AI scraper generation jobs from the queue
 */

import { Worker, Job } from 'bullmq'
import crypto from 'crypto'
import { createRedisConnection } from './connection'
import { SCRAPER_QUEUE_NAME } from './scraper'
import type { ScraperJobData, ScraperJobProgress } from './scraper'
import { AgentService } from '../services/agent'
import type { ScraperGenerationResult } from '../services/agent/types'
import { prisma } from '../utils/prisma'

// Create worker instance
let worker: Worker<ScraperJobData, ScraperGenerationResult, string> | null = null

export const startScraperWorker = () => {
  if (worker) {
    console.log('[ScraperWorker] Worker already running')
    return worker
  }

  console.log('[ScraperWorker] Starting worker...')

  worker = new Worker<ScraperJobData>(
    SCRAPER_QUEUE_NAME,
    async (job: Job<ScraperJobData>) => {
      console.log(`[ScraperWorker] Processing job ${job.id}: ${job.data.type}`)

      const agentService = new AgentService()

      try {
        // Update progress helper
        const updateProgress = async (progress: ScraperJobProgress) => {
          await job.updateProgress(progress)
        }

        await updateProgress({ stage: 'starting', message: 'Starting scraper generation...' })

        let result: ScraperGenerationResult

        switch (job.data.type) {
          case 'generate-venue': {
            const data = job.data
            result = await agentService.generateVenueScraper({
              url: data.url,
              llmProvider: data.llmProvider,
              llmModel: data.llmModel,
              maxIterations: data.maxIterations,
              userFeedback: data.userFeedback,
              onProgress: async (iteration, max) => {
                await updateProgress({
                  stage: 'generating',
                  iteration,
                  maxIterations: max,
                  message: `Iteration ${iteration}/${max}`,
                })
              },
            })
            break
          }

          case 'generate-events': {
            const data = job.data
            result = await agentService.generateEventScraper({
              url: data.url,
              llmProvider: data.llmProvider,
              llmModel: data.llmModel,
              maxIterations: data.maxIterations,
              venueInfo: data.venueInfo,
              userFeedback: data.userFeedback,
              previousCode: data.previousCode,
              venueId: data.venueId,
              onProgress: async (iteration, max) => {
                await updateProgress({
                  stage: 'generating',
                  iteration,
                  maxIterations: max,
                  message: `Iteration ${iteration}/${max}`,
                })
              },
            })
            break
          }

          case 'improve-scraper': {
            const data = job.data

            result = await agentService.generateEventScraper({
              url: data.url,
              llmProvider: data.llmProvider,
              llmModel: data.llmModel,
              maxIterations: data.maxIterations,
              venueInfo: data.venueInfo,
              userFeedback: data.userFeedback,
              previousCode: data.code,
              sourceId: data.sourceId,
              onProgress: async (iteration, max) => {
                await updateProgress({
                  stage: 'generating',
                  iteration,
                  maxIterations: max,
                  message: `Iteration ${iteration}/${max}`,
                })
              },
            })

            // If successful, create a new scraper version
            if (result.success && result.generatedCode) {
              await updateProgress({ stage: 'complete', message: 'Creating version...' })

              try {
                const lastVersion = await prisma.scraperVersion.findFirst({
                  where: { sourceId: data.sourceId },
                  orderBy: { versionNumber: 'desc' },
                  select: { versionNumber: true },
                })

                const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1

                await prisma.scraperVersion.create({
                  data: {
                    sourceId: data.sourceId,
                    versionNumber: nextVersionNumber,
                    code: result.generatedCode,
                    codeHash: crypto.createHash('sha256').update(result.generatedCode).digest('hex'),
                    description: `AI improvement: ${data.userFeedback.substring(0, 100)}`,
                    createdBy: data.userId,
                    createdFrom: 'AI_GENERATED',
                    agentSessionId: result.sessionId,
                    isActive: false,
                  },
                })

                console.log(`[ScraperWorker] Created version ${nextVersionNumber} for source ${data.sourceId}`)
              } catch (error) {
                console.error('[ScraperWorker] Failed to create version:', error)
                // Don't fail the job, the generation was still successful
              }
            }
            break
          }

          default:
            throw new Error(`Unknown job type: ${job.data.type}`)
        }

        // Update final progress
        if (result.success) {
          await updateProgress({
            stage: 'complete',
            message: 'Generation complete',
            completenessScore: result.completenessScore,
          })
        } else {
          await updateProgress({
            stage: 'failed',
            message: result.errorMessage || 'Generation failed',
          })
        }

        return result
      } catch (error) {
        console.error(`[ScraperWorker] Job ${job.id} failed:`, error)

        // Update session status to failed
        try {
          await prisma.agentSession.update({
            where: { id: job.data.sessionId },
            data: {
              status: 'FAILED',
              errorMessage: error instanceof Error ? error.message : String(error),
              completedAt: new Date(),
            },
          })
        } catch (dbError) {
          console.error('[ScraperWorker] Failed to update session status:', dbError)
        }

        throw error
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 2, // Process up to 2 jobs in parallel
      limiter: {
        max: 5, // Max 5 jobs per minute (to avoid API rate limits)
        duration: 60000,
      },
    }
  )

  // Event handlers
  worker.on('completed', (job) => {
    console.log(`[ScraperWorker] Job ${job.id} completed`)
  })

  worker.on('failed', (job, error) => {
    console.error(`[ScraperWorker] Job ${job?.id} failed:`, error.message)
  })

  worker.on('error', (error) => {
    console.error('[ScraperWorker] Worker error:', error)
  })

  return worker
}

export const stopScraperWorker = async () => {
  if (worker) {
    console.log('[ScraperWorker] Stopping worker...')
    await worker.close()
    worker = null
  }
}

// Clean up on process exit
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    await stopScraperWorker()
  })
  process.on('SIGINT', async () => {
    await stopScraperWorker()
  })
}
