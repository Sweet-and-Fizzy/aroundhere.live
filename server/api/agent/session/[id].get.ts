/**
 * Get agent session details
 * GET /api/agent/session/:id
 */

import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Session ID required',
    })
  }

  const session = await prisma.agentSession.findUnique({
    where: { id },
    include: {
      attempts: {
        orderBy: {
          attemptNumber: 'asc',
        },
        select: {
          id: true,
          attemptNumber: true,
          executionStatus: true,
          executionTime: true,
          fieldsFound: true,
          fieldsMissing: true,
          completenessScore: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
  })

  if (!session) {
    throw createError({
      statusCode: 404,
      message: 'Session not found',
    })
  }

  return session
})
