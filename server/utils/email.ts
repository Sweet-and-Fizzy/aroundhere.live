import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendMagicLinkEmail(email: string, magicLink: string) {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'https://aroundhere.live'
  const logoUrl = `${baseUrl}/around-here-logo.svg`

  // Log magic link for local development
  if (process.dev) {
    console.log('\n========== MAGIC LINK ==========')
    console.log(`Email: ${email}`)
    console.log(`Link: ${magicLink}`)
    console.log('=================================\n')
  }

  try {
    await resend.emails.send({
      from: config.emailFrom || 'AroundHere <whatsup@aroundhere.live>',
      to: email,
      subject: 'Sign in to AroundHere',
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
              <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Sign in to your account</h2>

              <p style="color: #4b5563; font-size: 15px; margin-bottom: 28px;">
                Click the button below to sign in. This link will expire in 15 minutes.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${magicLink}"
                   style="background-color: #111827;
                          color: #ffffff;
                          text-decoration: none;
                          padding: 14px 32px;
                          border-radius: 8px;
                          font-weight: 600;
                          font-size: 15px;
                          display: inline-block;">
                  Sign In
                </a>
              </div>

              <p style="color: #6b7280; font-size: 13px; margin-top: 32px;">
                If you didn't request this email, you can safely ignore it.
              </p>
            </div>

            <div style="background-color: #f3f4f6; padding: 20px 30px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                This link expires in 15 minutes for security.
              </p>
            </div>
          </body>
        </html>
      `,
      text: `
Sign in to AroundHere

Click the link below to sign in to your account:

${magicLink}

This link will expire in 15 minutes.

If you didn't request this email, you can safely ignore it.
      `.trim(),
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send magic link email:', error)
    return { success: false, error }
  }
}
