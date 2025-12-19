/**
 * Get all scraper attempts for a session with merged data
 * GET /api/agent/attempts/:sessionId
 */

import prisma from '../../../utils/prisma'
import { mergeVenueData } from '../../../services/agent/merger'

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      message: 'Session ID is required',
    })
  }

  // Get session
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    include: {
      attempts: {
        orderBy: { attemptNumber: 'asc' },
      },
    },
  })

  if (!session) {
    throw createError({
      statusCode: 404,
      message: 'Session not found',
    })
  }

  // Merge data from all attempts if venue info
  let mergeResult = null
  if (session.sessionType === 'VENUE_INFO' && session.attempts.length > 1) {
    mergeResult = mergeVenueData(
      session.attempts.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        scrapedData: attempt.scrapedData as Record<string, unknown>,
      }))
    )
  }

  return {
    session: {
      id: session.id,
      sessionType: session.sessionType,
      status: session.status,
      url: session.url,
      currentIteration: session.currentIteration,
      maxIterations: session.maxIterations,
      completenessScore: session.completenessScore,
    },
    attempts: session.attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      completenessScore: attempt.completenessScore,
      fieldsFound: attempt.fieldsFound,
      fieldsMissing: attempt.fieldsMissing,
      scrapedData: attempt.scrapedData,
      executionStatus: attempt.executionStatus,
      executionError: attempt.executionError,
      executionTime: attempt.executionTime,
      generatedCode: attempt.generatedCode,
      htmlSnapshots: attempt.htmlSnapshots,
      createdAt: attempt.createdAt,
    })),
    mergeResult,
  }
})
