import prisma from '../../../utils/prisma'
import { buildUserTasteProfile } from '../../../services/artist-profile'

// Valid event types from the EventType enum
const VALID_EVENT_TYPES = [
  'MUSIC', 'DJ', 'OPEN_MIC', 'COMEDY', 'THEATER', 'GAMES',
  'KARAOKE', 'PRIVATE', 'FILM', 'SPOKEN_WORD', 'DANCE',
  'MARKET', 'WORKSHOP', 'PARTY', 'FITNESS', 'DRAG', 'OTHER',
]

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string
  const body = await readBody(event)

  if (!body.eventType || typeof body.eventType !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'eventType is required',
    })
  }

  const eventType = body.eventType.toUpperCase().trim()

  // Validate that the event type is valid
  if (!VALID_EVENT_TYPES.includes(eventType)) {
    throw createError({
      statusCode: 400,
      message: `Invalid event type: ${eventType}`,
    })
  }

  // Create favorite (upsert to handle duplicates gracefully)
  await prisma.userFavoriteEventType.upsert({
    where: {
      userId_eventType: {
        userId,
        eventType,
      },
    },
    update: {},
    create: {
      userId,
      eventType,
    },
  })

  // Rebuild taste profile in background (don't await)
  buildUserTasteProfile(userId).catch(err => {
    console.error('Failed to rebuild taste profile after adding event type:', err)
  })

  return { success: true, eventType }
})
