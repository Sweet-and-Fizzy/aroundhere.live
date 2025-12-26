import bcrypt from 'bcrypt'
import { prisma } from '../../utils/prisma'

const BCRYPT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 8

export default defineEventHandler(async (event) => {
  const body = await readBody<{ token: string; password: string }>(event)

  if (!body.token) {
    throw createError({
      statusCode: 400,
      message: 'Reset token is required',
    })
  }

  if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
    throw createError({
      statusCode: 400,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    })
  }

  try {
    // Find the reset token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: body.token },
      include: { user: true },
    })

    if (!resetToken) {
      throw createError({
        statusCode: 400,
        message: 'Invalid or expired reset link',
      })
    }

    // Check if token has expired
    if (resetToken.expiresAt < new Date()) {
      // Delete expired token
      await prisma.passwordResetToken.delete({
        where: { id: resetToken.id },
      })

      throw createError({
        statusCode: 400,
        message: 'Reset link has expired. Please request a new one.',
      })
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)

    // Update user's password and ensure 'password' is in authMethods
    const authMethods = resetToken.user.authMethods.includes('password')
      ? resetToken.user.authMethods
      : [...resetToken.user.authMethods, 'password']

    const user = await prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        authMethods,
      },
    })

    // Delete the used token
    await prisma.passwordResetToken.delete({
      where: { id: resetToken.id },
    })

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
      message: 'Password has been reset successfully',
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

    console.error('Error resetting password:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to reset password',
    })
  }
})
