import { getRequestIP } from 'h3'
import { prisma } from '../../../utils/prisma'
import { checkRateLimit } from '../../../utils/rate-limit'
import { notifyEventReport } from '../../../services/notifications'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'

  // Rate limit anonymous reports: 5/hour per IP
  if (!userId) {
    const allowed = checkRateLimit(`report:${ip}`, 5, 3600_000)
    if (!allowed) {
      throw createError({ statusCode: 429, message: 'Too many reports. Please try again later.' })
    }
  }

  const body = await readBody(event)
  const { reason, message } = body

  const validReasons = ['WRONG_DATE', 'WRONG_VENUE', 'CANCELLED', 'DUPLICATE', 'SPAM', 'OTHER']
  if (!reason || !validReasons.includes(reason)) {
    throw createError({ statusCode: 400, message: 'Valid reason is required' })
  }

  // Verify event exists
  const eventRecord = await prisma.event.findUnique({
    where: { id },
    select: { id: true, title: true, slug: true },
  })

  if (!eventRecord) {
    throw createError({ statusCode: 404, message: 'Event not found' })
  }

  // Create report
  await prisma.eventReport.create({
    data: {
      eventId: id,
      userId: userId || null,
      reason,
      message: message?.slice(0, 1000) || null,
      ipAddress: ip,
    },
  })

  // Get reporter email for notifications
  let reporterEmail: string | null = null
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })
    reporterEmail = user?.email || null
  }

  // Notify admins
  notifyEventReport({
    eventTitle: eventRecord.title,
    eventSlug: eventRecord.slug,
    reason,
    message,
    reporterEmail,
  }).catch(err => console.error('[EventReport] Notification error:', err))

  return { success: true }
})
