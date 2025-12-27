import { randomBytes } from 'crypto'
import { prisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email: string; redirect?: string }>(event)

  if (!body.email || !body.email.includes('@')) {
    throw createError({
      statusCode: 400,
      message: 'Valid email address is required',
    })
  }

  const email = body.email.toLowerCase().trim()

  try {
    // Generate a secure random token
    const token = randomBytes(32).toString('hex')

    // Token expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    // Check if user exists, if not create them
    let user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          emailVerified: false,
          authMethods: ['magic_link'],
        },
      })
    }

    // Create login token
    await prisma.loginToken.create({
      data: {
        token,
        email,
        userId: user.id,
        expiresAt,
      },
    })

    // Build magic link
    const config = useRuntimeConfig()
    const baseUrl = config.public.siteUrl || `http://localhost:${process.env.PORT || 3000}`
    const redirectParam = body.redirect ? `&redirect=${encodeURIComponent(body.redirect)}` : ''
    const magicLink = `${baseUrl}/auth/verify?token=${token}${redirectParam}`

    // Send email
    await sendMagicLinkEmail(email, magicLink)

    return {
      success: true,
      message: 'Magic link sent to your email',
    }
  } catch (error) {
    console.error('Error sending magic link:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to send magic link',
    })
  }
})
