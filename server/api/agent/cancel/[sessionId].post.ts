/**
 * Cancel an agent session
 * POST /api/agent/cancel/:sessionId
 */

import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      message: 'Session ID required',
    })
  }

  try {
    // Update session status to FAILED with cancellation message
    const session = await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        status: 'FAILED',
        errorMessage: 'Cancelled by user',
        completedAt: new Date(),
      },
    })

    return {
      success: true,
      sessionId: session.id,
      status: session.status,
    }
  } catch (error) {
    console.error('Cancel session error:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to cancel session',
    })
  }
})
