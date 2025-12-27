/**
 * POST /api/scrapers/:sourceId/unpause-notifications
 * Unpause notifications for a source after admin review
 */

import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  // Check authentication
  const session = await getUserSession(event)
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  })

  if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: Admin access required',
    })
  }

  const sourceId = getRouterParam(event, 'sourceId')
  if (!sourceId) {
    throw createError({
      statusCode: 400,
      message: 'Source ID is required',
    })
  }

  try {
    const source = await prisma.source.update({
      where: { id: sourceId },
      data: {
        notificationsPaused: false,
        notificationsPausedAt: null,
        notificationsPausedReason: null,
      },
      select: {
        id: true,
        name: true,
        notificationsPaused: true,
      },
    })

    console.log(`[Admin] Unpaused notifications for source: ${source.name}`)

    return {
      success: true,
      source,
    }
  } catch (error: unknown) {
    console.error('Error unpausing notifications:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to unpause notifications',
    })
  }
})
