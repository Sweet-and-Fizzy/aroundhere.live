/**
 * Update event classification (event type and genres)
 * PATCH /api/events/:id/classification
 *
 * Body: {
 *   eventType?: EventType
 *   canonicalGenres?: string[]
 * }
 *
 * Admin/moderator only
 */

import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  // Check if user is authenticated and is admin/moderator
  const session = await getUserSession(event)
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  // Check if user is admin or moderator
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  })

  if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: Admin or moderator access required',
    })
  }

  const eventId = getRouterParam(event, 'id')
  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const body = await readBody(event)
  const { eventType, canonicalGenres } = body

  // Validate event type if provided
  const validEventTypes = [
    'MUSIC',
    'DJ',
    'OPEN_MIC',
    'COMEDY',
    'THEATER',
    'GAMES',
    'KARAOKE',
    'PRIVATE',
    'FILM',
    'SPOKEN_WORD',
    'DANCE',
    'MARKET',
    'WORKSHOP',
    'PARTY',
    'FITNESS',
    'DRAG',
    'OTHER',
  ]
  if (eventType && !validEventTypes.includes(eventType)) {
    throw createError({
      statusCode: 400,
      message: `Invalid event type. Must be one of: ${validEventTypes.join(', ')}`,
    })
  }

  // Build update data
  const updateData: any = {
    updatedAt: new Date(),
  }

  if (eventType !== undefined) {
    updateData.eventType = eventType
  }

  if (canonicalGenres !== undefined) {
    if (!Array.isArray(canonicalGenres)) {
      throw createError({
        statusCode: 400,
        message: 'canonicalGenres must be an array',
      })
    }
    updateData.canonicalGenres = canonicalGenres
  }

  // Update the event
  try {
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: updateData,
      select: {
        id: true,
        eventType: true,
        canonicalGenres: true,
      },
    })

    return {
      success: true,
      event: updatedEvent,
    }
  } catch (error) {
    console.error('Error updating event classification:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to update event classification',
    })
  }
})
