import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  // Only ADMIN can view users (not MODERATOR)
  if (session?.user?.role !== 'ADMIN') {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const users = await prisma.user.findMany({
    orderBy: [
      { role: 'asc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      emailVerified: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return { users }
})
