/**
 * Start a new agent session to generate a scraper
 * POST /api/agent/start
 */

import { agentService } from '../../services/agent'
import prisma from '../../utils/prisma'

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
        venueId: existingVenueId || null, // Link to existing venue if provided
      },
    })

    // Start generation in background (don't await)
    const generationPromise = sessionType === 'VENUE_INFO'
      ? agentService.generateVenueScraper({
          url,
          llmProvider,
          llmModel,
          maxIterations,
          userFeedback,
        })
      : agentService.generateEventScraper({
          url,
          llmProvider,
          llmModel,
          maxIterations,
          venueInfo,
          userFeedback,
          previousCode, // Pass existing code for updates
        })

    // Don't await - let it run in background
    generationPromise.catch((error) => {
      console.error('Background agent generation error:', error)
    })

    // Return session ID immediately so client can start streaming
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
