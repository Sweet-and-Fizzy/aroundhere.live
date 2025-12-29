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
  const eventType = getRouterParam(event, 'eventType')

  if (!eventType) {
    throw createError({
      statusCode: 400,
      message: 'Event type is required',
    })
  }

  // Validate that the event type is valid
  if (!VALID_EVENT_TYPES.includes(eventType)) {
    throw createError({
      statusCode: 400,
      message: `Invalid event type: ${eventType}`,
    })
  }

  await prisma.userFavoriteEventType.deleteMany({
    where: {
      userId,
      eventType,
    },
  })

  // Rebuild taste profile in background (don't await)
  buildUserTasteProfile(userId).catch(err => {
    console.error('Failed to rebuild taste profile after removing event type:', err)
  })

  return { success: true }
})
