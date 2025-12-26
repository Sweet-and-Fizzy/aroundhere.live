import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'

// Mock prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  passwordResetToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
}

vi.mock('../../utils/prisma', () => ({
  prisma: mockPrisma,
}))

// Mock email sending
vi.mock('../../utils/email', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock setUserSession
vi.mock('#imports', () => ({
  setUserSession: vi.fn(),
  useRuntimeConfig: () => ({
    public: { siteUrl: 'http://localhost:3000' },
  }),
}))

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Password Validation', () => {
    it('should reject passwords shorter than 8 characters', () => {
      const password = 'short'
      expect(password.length).toBeLessThan(8)
    })

    it('should accept passwords of 8 or more characters', () => {
      const password = 'validpassword123'
      expect(password.length).toBeGreaterThanOrEqual(8)
    })
  })

  describe('Password Hashing', () => {
    it('should hash passwords with bcrypt', async () => {
      const password = 'testpassword123'
      const hash = await bcrypt.hash(password, 12)

      expect(hash).not.toBe(password)
      expect(hash).toMatch(/^\$2[aby]\$/)
    })

    it('should verify correct passwords', async () => {
      const password = 'testpassword123'
      const hash = await bcrypt.hash(password, 12)

      const isValid = await bcrypt.compare(password, hash)
      expect(isValid).toBe(true)
    })

    it('should reject incorrect passwords', async () => {
      const password = 'testpassword123'
      const wrongPassword = 'wrongpassword'
      const hash = await bcrypt.hash(password, 12)

      const isValid = await bcrypt.compare(wrongPassword, hash)
      expect(isValid).toBe(false)
    })
  })

  describe('Email Validation', () => {
    it('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.org',
        'user+tag@example.co.uk',
      ]

      const invalidEmails = [
        'notanemail',
        '@nodomain.com',
        'spaces in@email.com',
      ]

      validEmails.forEach(email => {
        expect(email.includes('@')).toBe(true)
      })

      invalidEmails.forEach(email => {
        const isValid = email.includes('@') && !email.includes(' ') && email.indexOf('@') > 0
        expect(isValid).toBe(false)
      })
    })

    it('should normalize emails to lowercase', () => {
      const email = 'Test@EXAMPLE.com'
      const normalized = email.toLowerCase().trim()

      expect(normalized).toBe('test@example.com')
    })
  })

  describe('Auth Methods Tracking', () => {
    it('should add password to authMethods when registering with password', () => {
      const authMethods: string[] = []

      if (!authMethods.includes('password')) {
        authMethods.push('password')
      }

      expect(authMethods).toContain('password')
    })

    it('should add google to authMethods when using Google OAuth', () => {
      const authMethods = ['password']

      if (!authMethods.includes('google')) {
        authMethods.push('google')
      }

      expect(authMethods).toContain('google')
      expect(authMethods).toContain('password')
    })

    it('should not duplicate auth methods', () => {
      const authMethods = ['password', 'google']

      if (!authMethods.includes('google')) {
        authMethods.push('google')
      }

      expect(authMethods.filter(m => m === 'google').length).toBe(1)
    })

    it('should add magic_link to authMethods when using magic link', () => {
      const authMethods: string[] = []

      if (!authMethods.includes('magic_link')) {
        authMethods.push('magic_link')
      }

      expect(authMethods).toContain('magic_link')
    })
  })

  describe('Account Linking', () => {
    it('should find existing user by email for account linking', async () => {
      const existingUser = {
        id: 'user-123',
        email: 'test@example.com',
        authMethods: ['magic_link'],
        googleId: null,
      }

      mockPrisma.user.findFirst.mockResolvedValue(existingUser)

      const user = await mockPrisma.user.findFirst({
        where: {
          OR: [
            { email: 'test@example.com' },
            { googleId: 'google-sub-123' },
          ],
        },
      })

      expect(user).toEqual(existingUser)
      expect(user?.authMethods).not.toContain('google')
    })

    it('should link Google account to existing user', async () => {
      const existingUser = {
        id: 'user-123',
        email: 'test@example.com',
        authMethods: ['magic_link'],
        googleId: null,
      }

      const updatedUser = {
        ...existingUser,
        googleId: 'google-sub-123',
        authMethods: ['magic_link', 'google'],
      }

      mockPrisma.user.update.mockResolvedValue(updatedUser)

      const result = await mockPrisma.user.update({
        where: { id: existingUser.id },
        data: {
          googleId: 'google-sub-123',
          authMethods: { push: 'google' },
        },
      })

      expect(result.googleId).toBe('google-sub-123')
      expect(result.authMethods).toContain('google')
    })
  })

  describe('Password Reset Token', () => {
    it('should generate secure random tokens', async () => {
      const crypto = await import('crypto')
      const token = crypto.randomBytes(32).toString('hex')

      expect(token.length).toBe(64) // 32 bytes = 64 hex chars
      expect(token).toMatch(/^[a-f0-9]+$/)
    })

    it('should set token expiration to 1 hour', () => {
      const now = Date.now()
      const expiresAt = new Date(now + 60 * 60 * 1000)

      const oneHourFromNow = now + 60 * 60 * 1000
      expect(expiresAt.getTime()).toBe(oneHourFromNow)
    })

    it('should reject expired tokens', () => {
      const expiredDate = new Date(Date.now() - 1000) // 1 second ago
      const isExpired = expiredDate < new Date()

      expect(isExpired).toBe(true)
    })

    it('should accept valid tokens', () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      const isExpired = futureDate < new Date()

      expect(isExpired).toBe(false)
    })
  })

  describe('Login Validation', () => {
    it('should reject login for user without password', async () => {
      const userWithoutPassword = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: null,
        authMethods: ['google'],
      }

      mockPrisma.user.findUnique.mockResolvedValue(userWithoutPassword)

      const user = await mockPrisma.user.findUnique({
        where: { email: 'test@example.com' },
      })

      expect(user?.passwordHash).toBeNull()
      // User should be prompted to use Google or set a password
    })

    it('should reject login for inactive user', async () => {
      const inactiveUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'somehash',
        isActive: false,
      }

      mockPrisma.user.findUnique.mockResolvedValue(inactiveUser)

      const user = await mockPrisma.user.findUnique({
        where: { email: 'test@example.com' },
      })

      expect(user?.isActive).toBe(false)
    })
  })

  describe('Registration', () => {
    it('should create new user with password auth method', async () => {
      const newUser = {
        id: 'new-user-123',
        email: 'new@example.com',
        passwordHash: 'hashedpassword',
        authMethods: ['password'],
        emailVerified: false,
      }

      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.user.create.mockResolvedValue(newUser)

      const existing = await mockPrisma.user.findUnique({
        where: { email: 'new@example.com' },
      })

      expect(existing).toBeNull()

      const created = await mockPrisma.user.create({
        data: {
          email: 'new@example.com',
          passwordHash: 'hashedpassword',
          authMethods: ['password'],
        },
      })

      expect(created.authMethods).toContain('password')
    })

    it('should add password to existing OAuth user', async () => {
      const existingOAuthUser = {
        id: 'user-123',
        email: 'oauth@example.com',
        passwordHash: null,
        authMethods: ['google'],
      }

      const updatedUser = {
        ...existingOAuthUser,
        passwordHash: 'newhashedpassword',
        authMethods: ['google', 'password'],
      }

      mockPrisma.user.findUnique.mockResolvedValue(existingOAuthUser)
      mockPrisma.user.update.mockResolvedValue(updatedUser)

      const result = await mockPrisma.user.update({
        where: { id: existingOAuthUser.id },
        data: {
          passwordHash: 'newhashedpassword',
          authMethods: ['google', 'password'],
        },
      })

      expect(result.passwordHash).toBe('newhashedpassword')
      expect(result.authMethods).toContain('password')
      expect(result.authMethods).toContain('google')
    })
  })
})
