import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Protected Pages', () => {
  describe('Settings page', () => {
    it('has auth middleware defined', () => {
      const settingsPage = readFileSync(
        join(__dirname, '../../../app/pages/settings.vue'),
        'utf-8'
      )

      expect(settingsPage).toContain("middleware: ['auth']")
    })
  })

  describe('Interests page', () => {
    it('has auth middleware defined', () => {
      const interestsPage = readFileSync(
        join(__dirname, '../../../app/pages/interests.vue'),
        'utf-8'
      )

      expect(interestsPage).toContain("middleware: ['auth']")
    })
  })
})

describe('User Preferences API', () => {
  describe('GET /api/user/preferences', () => {
    it('requires authentication', () => {
      const preferencesGet = readFileSync(
        join(__dirname, '../user/preferences.get.ts'),
        'utf-8'
      )

      // Check that the handler checks for session
      expect(preferencesGet).toContain('getUserSession')
      expect(preferencesGet).toMatch(/if\s*\(\s*!session/)
      expect(preferencesGet).toContain('Authentication required')
    })

    it('returns region data', () => {
      const preferencesGet = readFileSync(
        join(__dirname, '../user/preferences.get.ts'),
        'utf-8'
      )

      expect(preferencesGet).toContain('regionId')
      expect(preferencesGet).toContain('availableRegions')
    })
  })

  describe('PUT /api/user/preferences', () => {
    it('requires authentication', () => {
      const preferencesPut = readFileSync(
        join(__dirname, '../user/preferences.put.ts'),
        'utf-8'
      )

      expect(preferencesPut).toContain('getUserSession')
      expect(preferencesPut).toMatch(/if\s*\(\s*!session/)
      expect(preferencesPut).toContain('Authentication required')
    })

    it('handles region updates', () => {
      const preferencesPut = readFileSync(
        join(__dirname, '../user/preferences.put.ts'),
        'utf-8'
      )

      expect(preferencesPut).toContain('regionId')
    })
  })
})

describe('Email Change API', () => {
  describe('POST /api/user/change-email', () => {
    it('requires authentication', () => {
      const changeEmail = readFileSync(
        join(__dirname, '../user/change-email.post.ts'),
        'utf-8'
      )

      expect(changeEmail).toContain('getUserSession')
      expect(changeEmail).toContain('Authentication required')
    })

    it('validates email format', () => {
      const changeEmail = readFileSync(
        join(__dirname, '../user/change-email.post.ts'),
        'utf-8'
      )

      expect(changeEmail).toContain('emailRegex')
      expect(changeEmail).toContain('Invalid email address')
    })

    it('checks for existing email', () => {
      const changeEmail = readFileSync(
        join(__dirname, '../user/change-email.post.ts'),
        'utf-8'
      )

      expect(changeEmail).toContain('already in use')
    })

    it('sends verification email', () => {
      const changeEmail = readFileSync(
        join(__dirname, '../user/change-email.post.ts'),
        'utf-8'
      )

      expect(changeEmail).toContain('Resend')
      expect(changeEmail).toContain('verify-email-change')
    })
  })

  describe('GET /api/auth/verify-email-change', () => {
    it('validates token', () => {
      const verifyEmailChange = readFileSync(
        join(__dirname, '../auth/verify-email-change.get.ts'),
        'utf-8'
      )

      expect(verifyEmailChange).toContain('Token is required')
      expect(verifyEmailChange).toContain('Invalid or expired token')
    })

    it('checks token expiration', () => {
      const verifyEmailChange = readFileSync(
        join(__dirname, '../auth/verify-email-change.get.ts'),
        'utf-8'
      )

      expect(verifyEmailChange).toContain('expiresAt')
      expect(verifyEmailChange).toContain('Token has expired')
    })

    it('updates user email', () => {
      const verifyEmailChange = readFileSync(
        join(__dirname, '../auth/verify-email-change.get.ts'),
        'utf-8'
      )

      expect(verifyEmailChange).toContain('prisma.user.update')
      expect(verifyEmailChange).toContain('newEmail')
    })
  })
})

describe('Auth Verify with Region', () => {
  it('sets default region from IP on login', () => {
    const authVerify = readFileSync(
      join(__dirname, '../auth/verify.get.ts'),
      'utf-8'
    )

    expect(authVerify).toContain('getLocationFromIp')
    expect(authVerify).toContain('regionId')
    expect(authVerify).toContain('haversineDistance')
  })
})
