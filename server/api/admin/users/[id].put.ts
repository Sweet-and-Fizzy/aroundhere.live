import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  // Only ADMIN can update users
  if (session?.user?.role !== 'ADMIN') {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const userId = getRouterParam(event, 'id')
  const body = await readBody<{ role?: string; isActive?: boolean }>(event)

  if (!userId) {
    throw createError({
      statusCode: 400,
      message: 'User ID is required',
    })
  }

  // Validate role if provided
  const validRoles = ['ADMIN', 'MODERATOR', 'USER']
  if (body.role && !validRoles.includes(body.role)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid role',
    })
  }

  // Prevent admins from demoting themselves
  if (userId === session.user.id && body.role && body.role !== 'ADMIN') {
    throw createError({
      statusCode: 400,
      message: 'You cannot change your own role',
    })
  }

  // Check if target user is the super admin - they can't be demoted
  const config = useRuntimeConfig()
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  const isSuperAdmin = targetUser && config.superAdminEmail &&
    targetUser.email.toLowerCase() === config.superAdminEmail.toLowerCase()

  if (isSuperAdmin) {
    if (body.role && body.role !== 'ADMIN') {
      throw createError({
        statusCode: 400,
        message: 'Cannot change the role of the super admin',
      })
    }
    if (body.isActive === false) {
      throw createError({
        statusCode: 400,
        message: 'Cannot deactivate the super admin',
      })
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(body.role && { role: body.role as 'ADMIN' | 'MODERATOR' | 'USER' }),
      ...(typeof body.isActive === 'boolean' && { isActive: body.isActive }),
    },
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

  return { user }
})
