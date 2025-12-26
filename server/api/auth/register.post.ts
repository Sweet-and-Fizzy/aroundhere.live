import bcrypt from 'bcrypt'
import { prisma } from '../../utils/prisma'

const BCRYPT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 8

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email: string; password: string }>(event)

  // Validate email
  if (!body.email || !body.email.includes('@')) {
    throw createError({
      statusCode: 400,
      message: 'Valid email address is required',
    })
  }

  // Validate password
  if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
    throw createError({
      statusCode: 400,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    })
  }

  const email = body.email.toLowerCase().trim()

  try {
    // Hash the password
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    let user

    if (existingUser) {
      // User exists - add password to their account (link auth method)
      if (existingUser.passwordHash) {
        throw createError({
          statusCode: 400,
          message: 'An account with this email already exists. Please login instead.',
        })
      }

      // Add password to existing account
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          authMethods: {
            push: 'password',
          },
        },
      })
    } else {
      // Create new user with password
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          emailVerified: false,
          authMethods: ['password'],
        },
      })
    }

    // Auto-login: set user session
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    })

    return {
      success: true,
      message: 'Account created successfully',
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

    console.error('Error registering user:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to create account',
    })
  }
})
