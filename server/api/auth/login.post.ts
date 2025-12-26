import bcrypt from 'bcrypt'
import { prisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email: string; password: string }>(event)

  // Validate input
  if (!body.email || !body.email.includes('@')) {
    throw createError({
      statusCode: 400,
      message: 'Valid email address is required',
    })
  }

  if (!body.password) {
    throw createError({
      statusCode: 400,
      message: 'Password is required',
    })
  }

  const email = body.email.toLowerCase().trim()

  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      throw createError({
        statusCode: 401,
        message: 'Invalid email or password',
      })
    }

    // Check if user has a password set
    if (!user.passwordHash) {
      // User exists but hasn't set a password - they use OAuth or magic link
      throw createError({
        statusCode: 401,
        message: 'This account uses a different login method. Try signing in with Google or using a magic link.',
      })
    }

    // Check if account is active
    if (!user.isActive) {
      throw createError({
        statusCode: 401,
        message: 'This account has been deactivated',
      })
    }

    // Verify password
    const isValid = await bcrypt.compare(body.password, user.passwordHash)

    if (!isValid) {
      throw createError({
        statusCode: 401,
        message: 'Invalid email or password',
      })
    }

    // Set user session
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    })

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    }
  } catch (error: any) {
    // Re-throw if it's already a createError
    if (error.statusCode) {
      throw error
    }

    console.error('Error logging in:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to login',
    })
  }
})
