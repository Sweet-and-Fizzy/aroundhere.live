import { prisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Token is required',
    })
  }

  try {
    // Find the login token
    const loginToken = await prisma.loginToken.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!loginToken) {
      throw createError({
        statusCode: 401,
        message: 'Invalid or expired token',
      })
    }

    // Check if token has expired
    if (loginToken.expiresAt < new Date()) {
      // Delete expired token
      await prisma.loginToken.delete({
        where: { id: loginToken.id },
      })

      throw createError({
        statusCode: 401,
        message: 'Token has expired',
      })
    }

    // Get or create user
    let user = loginToken.user
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: loginToken.email },
      })

      if (!user) {
        throw createError({
          statusCode: 404,
          message: 'User not found',
        })
      }
    }

    // Check if user is active
    if (!user.isActive) {
      // Delete the used token
      await prisma.loginToken.delete({
        where: { id: loginToken.id },
      })

      throw createError({
        statusCode: 403,
        message: 'Account has been deactivated',
      })
    }

    // Check if this is the super admin
    const config = useRuntimeConfig()
    const isSuperAdmin = config.superAdminEmail && user.email.toLowerCase() === config.superAdminEmail.toLowerCase()

    // Mark email as verified and upgrade super admin to ADMIN role
    if (!user.emailVerified || (isSuperAdmin && user.role !== 'ADMIN')) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          ...(isSuperAdmin && { role: 'ADMIN' }),
        },
      })
    }

    // Create session
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    })

    // Delete the used token
    await prisma.loginToken.delete({
      where: { id: loginToken.id },
    })

    return {
      success: true,
      message: 'Successfully logged in',
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        role: user.role,
      },
    }
  } catch (error) {
    console.error('Error verifying magic link:', error)

    // If it's already a createError, rethrow it
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to verify magic link',
    })
  }
})
