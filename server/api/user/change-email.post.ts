import prisma from '../../utils/prisma'
import { randomBytes } from 'crypto'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string
  const body = await readBody(event)
  const { newEmail } = body

  if (!newEmail || typeof newEmail !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'New email address is required',
    })
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(newEmail)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid email address',
    })
  }

  // Check if email is already in use
  const existingUser = await prisma.user.findUnique({
    where: { email: newEmail.toLowerCase() },
  })

  if (existingUser) {
    throw createError({
      statusCode: 400,
      message: 'This email address is already in use',
    })
  }

  // Generate verification token
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  // Store pending email change
  await prisma.loginToken.create({
    data: {
      userId,
      token,
      expiresAt,
      // Store the new email in a way we can retrieve it
      // We'll use a special prefix to identify email change tokens
      email: `change:${newEmail.toLowerCase()}`,
    },
  })

  // Send verification email
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'https://aroundhere.live'
  const verifyUrl = `${baseUrl}/api/auth/verify-email-change?token=${token}`

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  const logoUrl = `${baseUrl}/around-here-logo.svg`

  try {
    await resend.emails.send({
      from: config.emailFrom || 'AroundHere <whatsup@aroundhere.live>',
      to: newEmail.toLowerCase(),
      subject: 'Confirm your new email address',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f3f4f6;">
            <div style="background-color: #111827; padding: 32px 30px; text-align: center;">
              <img src="${logoUrl}" alt="AroundHere.Live" style="height: 28px; width: auto;" />
            </div>

            <div style="background-color: #ffffff; padding: 40px 30px;">
              <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Confirm your new email address</h2>

              <p style="color: #4b5563; font-size: 15px; margin-bottom: 28px;">
                Click the button below to confirm this as your new email address for AroundHere. This link will expire in 24 hours.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${verifyUrl}"
                   style="background-color: #111827;
                          color: #ffffff;
                          text-decoration: none;
                          padding: 14px 32px;
                          border-radius: 8px;
                          font-weight: 600;
                          font-size: 15px;
                          display: inline-block;">
                  Confirm Email Change
                </a>
              </div>

              <p style="color: #6b7280; font-size: 13px; margin-top: 32px;">
                If you didn't request this email change, you can safely ignore this message.
              </p>
            </div>

            <div style="background-color: #f3f4f6; padding: 20px 30px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                This link expires in 24 hours for security.
              </p>
            </div>
          </body>
        </html>
      `,
      text: `
Confirm your new email address

Click the link below to confirm this as your new email address for AroundHere:

${verifyUrl}

This link will expire in 24 hours.

If you didn't request this email change, you can safely ignore this message.
      `.trim(),
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send email change verification:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to send verification email',
    })
  }
})
