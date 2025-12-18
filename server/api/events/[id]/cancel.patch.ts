import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  // Check authentication
  const session = await getUserSession(event)
  if (!session?.user || !['ADMIN', 'MODERATOR'].includes(session.user.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Unauthorized - Admin or Moderator access required',
    })
  }

  const eventId = getRouterParam(event, 'id')
  if (!eventId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Event ID is required',
    })
  }

  const body = await readBody(event)
  const { isCancelled } = body

  if (typeof isCancelled !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'isCancelled must be a boolean',
    })
  }

  try {
    // Update the event's cancelled status
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: { isCancelled },
      select: {
        id: true,
        title: true,
        isCancelled: true,
      },
    })

    return {
      success: true,
      event: updatedEvent,
    }
  } catch (error) {
    console.error('Error updating event cancelled status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update event cancelled status',
    })
  }
})
