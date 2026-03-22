import { prisma } from '../../../utils/prisma'
import { sendSubmissionStatusEmail } from '../../../utils/email'
import { classifySingleEvent } from '../../../scrapers/classify-events'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user?.role || !['ADMIN', 'MODERATOR'].includes(session.user.role as string)) {
    throw createError({ statusCode: 403, message: 'Admin access required' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  const body = await readBody(event)
  const { action } = body

  const validActions = ['approve', 'reject', 'revoke', 'reopen']
  if (!action || !validActions.includes(action)) {
    throw createError({ statusCode: 400, message: `Valid action required (${validActions.join(', ')})` })
  }

  const statusMap = {
    approve: 'APPROVED' as const,
    reject: 'REJECTED' as const,
    revoke: 'PENDING' as const,
    reopen: 'PENDING' as const,
  }
  const reviewStatus = statusMap[action as keyof typeof statusMap]

  const updated = await prisma.event.update({
    where: { id },
    data: {
      reviewStatus,
      reviewedBy: session.user.id as string,
      reviewedAt: new Date(),
    },
    include: {
      submittedBy: {
        select: { email: true },
      },
    },
  })

  // Classify the event on approval if not yet classified
  if (action === 'approve' && updated.isMusic === null) {
    classifySingleEvent(prisma, id)
      .catch(err => console.error('[SubmissionReview] Classification error:', err))
  }

  // Notify submitter (only for approve/reject, not revoke/reopen)
  if ((action === 'approve' || action === 'reject') && updated.submittedBy?.email) {
    sendSubmissionStatusEmail(updated.submittedBy.email, {
      eventTitle: updated.title,
      eventSlug: updated.slug,
      status: reviewStatus as 'APPROVED' | 'REJECTED',
    }).catch(err => console.error('[SubmissionReview] Email error:', err))
  }

  return updated
})
