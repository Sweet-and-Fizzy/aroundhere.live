import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendMagicLinkEmail(email: string, magicLink: string) {
  const config = useRuntimeConfig()

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
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">AroundHere</h1>
            </div>

            <div style="background: #f9fafb; padding: 40px 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #1f2937; margin-top: 0;">Sign in to your account</h2>

              <p style="color: #4b5563; font-size: 16px;">
                Click the button below to sign in to AroundHere. This link will expire in 15 minutes.
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${magicLink}"
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                          color: white;
                          text-decoration: none;
                          padding: 14px 32px;
                          border-radius: 8px;
                          font-weight: 600;
                          font-size: 16px;
                          display: inline-block;">
                  Sign In
                </a>
              </div>

              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                If you didn't request this email, you can safely ignore it.
              </p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

              <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                This link will expire in 15 minutes for security reasons.
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
