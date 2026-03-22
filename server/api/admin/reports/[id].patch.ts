import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user?.role || !['ADMIN', 'MODERATOR'].includes(session.user.role as string)) {
    throw createError({ statusCode: 403, message: 'Admin access required' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Report ID is required' })
  }

  const body = await readBody(event)
  const { status, adminNote } = body

  if (!status || !['RESOLVED', 'DISMISSED'].includes(status)) {
    throw createError({ statusCode: 400, message: 'Valid status required (RESOLVED or DISMISSED)' })
  }

  const report = await prisma.eventReport.update({
    where: { id },
    data: {
      status,
      adminNote: adminNote || null,
      resolvedBy: session.user.id as string,
      resolvedAt: new Date(),
    },
    include: {
      event: { select: { id: true, title: true, slug: true } },
    },
  })

  return report
})
