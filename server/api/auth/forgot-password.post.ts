import { randomBytes } from 'crypto'
import { prisma } from '../../utils/prisma'
import { sendPasswordResetEmail } from '../../utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email: string }>(event)

  if (!body.email || !body.email.includes('@')) {
    throw createError({
      statusCode: 400,
      message: 'Valid email address is required',
    })
  }

  const email = body.email.toLowerCase().trim()

  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    })

    // Always return success to prevent email enumeration
    // Send email if user exists (allows OAuth users to add a password)
    if (user) {
      // Generate a secure random token
      const token = randomBytes(32).toString('hex')

      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

      // Delete any existing reset tokens for this user
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      })

      // Create password reset token
      await prisma.passwordResetToken.create({
        data: {
          token,
          email,
          userId: user.id,
          expiresAt,
        },
      })

      // Build reset link
      const config = useRuntimeConfig()
      const baseUrl = config.public.siteUrl || `http://localhost:${process.env.PORT || 3000}`
      const resetLink = `${baseUrl}/reset-password?token=${token}`

      // Send email
      await sendPasswordResetEmail(email, resetLink)
    }

    // Always return success to prevent email enumeration
    return {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    }
  } catch (error) {
    console.error('Error sending password reset:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to process password reset request',
    })
  }
})
