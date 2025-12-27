/**
 * Set user's attendance status for an event
 * POST /api/events/:id/attendance
 * Body: { status: 'INTERESTED' | 'GOING' }
 */

import prisma from '../../../utils/prisma'
import type { EventAttendanceStatus } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string
  const eventId = getRouterParam(event, 'id')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const body = await readBody(event)
  const status = body.status as EventAttendanceStatus

  if (!status || !['INTERESTED', 'GOING'].includes(status)) {
    throw createError({
      statusCode: 400,
      message: 'Valid status (INTERESTED or GOING) is required',
    })
  }

  // Verify event exists
  const eventRecord = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  })

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Upsert attendance status
  const attendance = await prisma.userEventAttendance.upsert({
    where: {
      userId_eventId: {
        userId,
        eventId,
      },
    },
    update: {
      status,
    },
    create: {
      userId,
      eventId,
      status,
    },
  })

  // Get updated counts
  const [interestedCount, goingCount] = await Promise.all([
    prisma.userEventAttendance.count({
      where: { eventId, status: 'INTERESTED' },
    }),
    prisma.userEventAttendance.count({
      where: { eventId, status: 'GOING' },
    }),
  ])

  return {
    success: true,
    status: attendance.status,
    interestedCount,
    goingCount,
  }
})
