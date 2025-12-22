/**
 * GET /api/agent/sessions/:sessionId
 * Get agent session details for progress polling
 */

import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      message: 'Session ID is required',
    })
  }

  try {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        url: true,
        sessionType: true,
        status: true,
        llmProvider: true,
        llmModel: true,
        currentIteration: true,
        maxIterations: true,
        venueData: true,
        eventData: true,
        generatedCode: true,
        completenessScore: true,
        errorMessage: true,
        thinking: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        venueId: true,
        sourceId: true,
      },
    })

    if (!session) {
      throw createError({
        statusCode: 404,
        message: 'Session not found',
      })
    }

    return session
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Error fetching session:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch session',
    })
  }
})
