/**
 * Scraper generation job queue
 * Handles AI-powered scraper generation with persistence and retry
 */

import { Queue } from 'bullmq'
import { getProducerConnection } from './connection'
import type { VenueInfo } from '../services/agent/types'

// Job data types
export interface GenerateVenueJobData {
  type: 'generate-venue'
  url: string
  sessionId: string
  llmProvider: string
  llmModel: string
  maxIterations: number
  userFeedback?: string
}

export interface GenerateEventsJobData {
  type: 'generate-events'
  url: string
  sessionId: string
  llmProvider: string
  llmModel: string
  maxIterations: number
  venueInfo: VenueInfo
  userFeedback?: string
  previousCode?: string
  venueId?: string
}

export interface ImproveScraperJobData {
  type: 'improve-scraper'
  sourceId: string
  sessionId: string
  url: string
  llmProvider: string
  llmModel: string
  maxIterations: number
  venueInfo: VenueInfo
  code?: string
  userFeedback: string
  userId: string
}

export type ScraperJobData = GenerateVenueJobData | GenerateEventsJobData | ImproveScraperJobData

// Job progress data
export interface ScraperJobProgress {
  stage: 'starting' | 'fetching' | 'generating' | 'validating' | 'executing' | 'evaluating' | 'complete' | 'failed'
  iteration?: number
  maxIterations?: number
  message?: string
  completenessScore?: number
}

// Queue name
export const SCRAPER_QUEUE_NAME = 'scraper-generation'

// Queue instance (lazy initialization)
let scraperQueue: Queue<ScraperJobData, any, string> | null = null

export const getScraperQueue = () => {
  if (!scraperQueue) {
    scraperQueue = new Queue<ScraperJobData>(SCRAPER_QUEUE_NAME, {
      connection: getProducerConnection(),
      defaultJobOptions: {
        attempts: 2, // Retry once on failure
        backoff: {
          type: 'exponential',
          delay: 5000, // 5 second initial delay
        },
        removeOnComplete: {
          age: 24 * 60 * 60, // Keep completed jobs for 24 hours
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
        },
      },
    })
  }
  return scraperQueue
}

// Helper to add jobs with proper options
export const addScraperJob = async (
  data: ScraperJobData,
  options?: {
    priority?: number
    timeout?: number
  }
) => {
  const queue = getScraperQueue()

  // Use sessionId as job ID to prevent duplicates
  const jobId = data.sessionId

  return queue.add(data.type, data, {
    jobId,
    timeout: options?.timeout || 10 * 60 * 1000, // 10 minute default timeout
    priority: options?.priority,
  })
}
