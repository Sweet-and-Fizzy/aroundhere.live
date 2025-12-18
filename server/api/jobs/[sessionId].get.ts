/**
 * GET /api/jobs/:sessionId
 * Get job status and progress from BullMQ queue
 */

import { getScraperQueue } from '../../queues/scraper'
import type { ScraperJobProgress } from '../../queues/scraper'

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      message: 'Session ID is required',
    })
  }

  try {
    const queue = getScraperQueue()

    // Job ID is the session ID
    const job = await queue.getJob(sessionId)

    if (!job) {
      return {
        found: false,
        sessionId,
        message: 'Job not found in queue (may have been processed and removed)',
      }
    }

    const state = await job.getState()
    const progress = job.progress as ScraperJobProgress | undefined

    return {
      found: true,
      sessionId,
      jobId: job.id,
      state, // 'completed' | 'failed' | 'delayed' | 'active' | 'waiting' | 'paused' | 'stuck'
      progress: progress || null,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
    }
  } catch (error: any) {
    console.error('Error fetching job status:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch job status',
    })
  }
})
