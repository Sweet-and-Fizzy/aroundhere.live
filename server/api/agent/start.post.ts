/**
 * Start a new agent session to generate a scraper
 * POST /api/agent/start
 */

import prisma from '../../utils/prisma'
import { addScraperJob } from '../../queues/scraper'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const {
    url,
    sessionType, // 'VENUE_INFO' or 'EVENT_SCRAPER'
    llmProvider,
    llmModel,
    maxIterations,
    venueInfo, // Required for EVENT_SCRAPER
    existingVenueId, // Optional - use existing venue instead of creating new
    userFeedback, // Optional - feedback from user for retry
    previousCode, // Optional - existing scraper code for updates
  } = body

  // Validation
  if (!url || !sessionType || !llmProvider || !llmModel) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: url, sessionType, llmProvider, llmModel',
    })
  }

  if (sessionType !== 'VENUE_INFO' && sessionType !== 'EVENT_SCRAPER') {
    throw createError({
      statusCode: 400,
      message: 'sessionType must be VENUE_INFO or EVENT_SCRAPER',
    })
  }

  if (sessionType === 'EVENT_SCRAPER' && !venueInfo) {
    throw createError({
      statusCode: 400,
      message: 'venueInfo is required for EVENT_SCRAPER sessions',
    })
  }

  try {
    // Create initial session to get ID
    const session = await prisma.agentSession.create({
      data: {
        url,
        sessionType,
        llmProvider,
        llmModel,
        maxIterations: maxIterations || 5,
        status: 'IN_PROGRESS',
        venueId: existingVenueId || null,
      },
    })

    // Add job to queue based on session type
    if (sessionType === 'VENUE_INFO') {
      await addScraperJob({
        type: 'generate-venue',
        url,
        sessionId: session.id,
        llmProvider,
        llmModel,
        maxIterations: maxIterations || 5,
        userFeedback,
      })
    } else {
      await addScraperJob({
        type: 'generate-events',
        url,
        sessionId: session.id,
        llmProvider,
        llmModel,
        maxIterations: maxIterations || 5,
        venueInfo,
        userFeedback,
        previousCode,
        venueId: existingVenueId,
      })
    }

    console.log(`[Agent] Queued ${sessionType} job for session ${session.id}`)

    // Return session ID immediately so client can start polling
    return {
      success: true,
      sessionId: session.id,
      streaming: true,
    }
  } catch (error) {
    console.error('Agent generation error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to start scraper generation',
    })
  }
})
