import { sendRedirect } from 'h3'
import { prisma } from '../../utils/prisma'

export default defineOAuthGoogleEventHandler({
  config: {
    scope: ['email', 'profile'],
  },
  async onSuccess(event, { user: googleUser }) {
    const email = googleUser.email?.toLowerCase().trim()

    if (!email) {
      console.error('Google OAuth: No email returned from Google')
      return sendRedirect(event, '/login?error=no_email')
    }

    try {
      // Find existing user by email or Google ID
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { googleId: googleUser.sub },
          ],
        },
      })

      if (user) {
        // Update existing user with Google ID if not set, and ensure 'google' is in authMethods
        const updates: any = {}

        if (!user.googleId) {
          updates.googleId = googleUser.sub
        }

        if (!user.authMethods.includes('google')) {
          updates.authMethods = { push: 'google' }
        }

        // Always mark email as verified when using Google OAuth
        if (!user.emailVerified) {
          updates.emailVerified = true
        }

        // Update display name if not set
        if (!user.displayName && googleUser.name) {
          updates.displayName = googleUser.name
        }

        if (Object.keys(updates).length > 0) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: updates,
          })
        }
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            email,
            googleId: googleUser.sub,
            displayName: googleUser.name || undefined,
            emailVerified: true,
            authMethods: ['google'],
          },
        })
      }

      // Check if account is active
      if (!user.isActive) {
        return sendRedirect(event, '/login?error=account_disabled')
      }

      // Set user session
      await setUserSession(event, {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      })

      return sendRedirect(event, '/')
    } catch (error) {
      console.error('Google OAuth error:', error)
      return sendRedirect(event, '/login?error=auth_failed')
    }
  },
  onError(event, error) {
    console.error('Google OAuth error:', error)
    return sendRedirect(event, '/login?error=auth_failed')
  },
})
