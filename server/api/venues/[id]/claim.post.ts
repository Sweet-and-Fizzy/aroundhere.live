import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const venueId = getRouterParam(event, 'id')
  if (!venueId) {
    throw createError({ statusCode: 400, statusMessage: 'Venue ID is required' })
  }

  const body = await readBody(event)
  const { role, contactInfo } = body || {}

  if (!role || !['owner', 'manager', 'booker'].includes(role)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid role is required (owner, manager, or booker)' })
  }

  // Verify venue exists
  const venue = await prisma.venue.findUnique({ where: { id: venueId } })
  if (!venue) {
    throw createError({ statusCode: 404, statusMessage: 'Venue not found' })
  }

  // Check for existing active claim
  const existing = await prisma.venueModerator.findUnique({
    where: { venueId_userId: { venueId, userId } },
  })

  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'You have already submitted a claim for this venue' })
  }

  // Create pending claim
  await prisma.venueModerator.create({
    data: {
      venueId,
      userId,
      role,
      contactInfo: contactInfo?.slice(0, 1000) || null,
      isActive: false,
    },
  })

  // Notify admins
  const { notifyVenueClaim } = await import('../../../services/notifications')
  await notifyVenueClaim({
    venueName: venue.name,
    venueSlug: venue.slug,
    claimerEmail: session.user?.email as string || 'Unknown',
    role,
  }).catch(() => {}) // Don't fail the request if notification fails

  return { success: true }
})
