export default defineEventHandler(async (event) => {
  // Skip auth check for public routes
  const publicRoutes = [
    '/api/auth/send-magic-link',
    '/api/auth/verify',
    '/api/auth/logout',
  ]

  if (publicRoutes.some(route => event.path.startsWith(route))) {
    return
  }

  // Admin routes require ADMIN or MODERATOR role
  const adminRoutes = [
    '/api/admin',
    '/api/agent',
  ]

  const requiresAdmin = adminRoutes.some(route => event.path.startsWith(route))

  if (requiresAdmin) {
    const session = await getUserSession(event)

    if (!session?.user) {
      throw createError({
        statusCode: 401,
        message: 'Authentication required',
      })
    }

    const userRole = session.user.role as string
    if (userRole !== 'ADMIN' && userRole !== 'MODERATOR') {
      throw createError({
        statusCode: 403,
        message: 'Admin or moderator access required',
      })
    }
  }
})
