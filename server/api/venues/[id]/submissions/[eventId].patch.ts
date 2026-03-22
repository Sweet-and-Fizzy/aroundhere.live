import prisma from '../../../../utils/prisma'
import { isVenueModerator } from '../../../../utils/venue-moderator'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const venueId = getRouterParam(event, 'id')
  const eventId = getRouterParam(event, 'eventId')

  if (!venueId || !eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Venue ID and Event ID are required' })
  }

  const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'MODERATOR'
  const isModerator = await isVenueModerator(prisma, userId, venueId)

  if (!isAdmin && !isModerator) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied' })
  }

  const body = await readBody(event)
  const { action } = body || {}

  if (!action || !['approve', 'reject'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid action is required (approve or reject)' })
  }

  // Verify event belongs to venue
  const eventData = await prisma.event.findFirst({
    where: { id: eventId, venueId },
    include: { submittedBy: { select: { email: true } } },
  })

  if (!eventData) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found at this venue' })
  }

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: {
      reviewStatus: action === 'approve' ? 'APPROVED' : 'REJECTED',
      reviewedBy: userId,
      reviewedAt: new Date(),
    },
  })

  // Notify submitter
  if (eventData.submittedBy?.email) {
    const { sendSubmissionStatusEmail } = await import('../../../../utils/email')
    await sendSubmissionStatusEmail(eventData.submittedBy.email, {
      eventTitle: eventData.title,
      eventSlug: eventData.slug,
      status: action === 'approve' ? 'APPROVED' : 'REJECTED',
    }).catch(() => {})
  }

  return updated
})
