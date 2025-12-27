/**
 * Batch check user's attendance status for multiple events
 * GET /api/events/attendance/check?eventIds=id1,id2,id3
 * Returns map of eventId -> status
 */

import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    // Return empty map for unauthenticated users
    return { attendance: {} }
  }

  const userId = session.user.id as string
  const query = getQuery(event)
  const eventIdsParam = query.eventIds as string

  if (!eventIdsParam) {
    return { attendance: {} }
  }

  const eventIds = eventIdsParam.split(',').filter(Boolean)

  if (eventIds.length === 0) {
    return { attendance: {} }
  }

  // Limit to prevent abuse
  if (eventIds.length > 100) {
    throw createError({
      statusCode: 400,
      message: 'Too many event IDs (max 100)',
    })
  }

  const records = await prisma.userEventAttendance.findMany({
    where: {
      userId,
      eventId: { in: eventIds },
    },
    select: {
      eventId: true,
      status: true,
    },
  })

  // Build map of eventId -> status
  const attendance: Record<string, string> = {}
  for (const record of records) {
    attendance[record.eventId] = record.status
  }

  return { attendance }
})
