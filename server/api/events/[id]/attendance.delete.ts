/**
 * Remove user's attendance status for an event
 * DELETE /api/events/:id/attendance
 */

import prisma from '../../../utils/prisma'

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

  // Delete attendance (if exists)
  await prisma.userEventAttendance.deleteMany({
    where: {
      userId,
      eventId,
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
    status: null,
    interestedCount,
    goingCount,
  }
})
