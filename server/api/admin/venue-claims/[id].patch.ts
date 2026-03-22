import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'MODERATOR') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Claim ID is required' })
  }

  const body = await readBody(event)
  const { action } = body || {}

  if (!action || !['approve', 'reject'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid action is required (approve or reject)' })
  }

  const claim = await prisma.venueModerator.findUnique({ where: { id } })
  if (!claim) {
    throw createError({ statusCode: 404, statusMessage: 'Claim not found' })
  }

  if (action === 'approve') {
    const updated = await prisma.venueModerator.update({
      where: { id },
      data: {
        isActive: true,
        verifiedAt: new Date(),
        verifiedBy: session.user?.id as string,
      },
    })
    return updated
  } else {
    const updated = await prisma.venueModerator.update({
      where: { id },
      data: {
        isActive: false,
        verifiedAt: new Date(),
        verifiedBy: session.user?.id as string,
      },
    })
    return updated
  }
})
