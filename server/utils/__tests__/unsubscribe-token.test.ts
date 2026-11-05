import { describe, it, expect } from 'vitest'
import { createUnsubscribeToken, verifyUnsubscribeToken } from '../unsubscribe-token'

describe('unsubscribe tokens', () => {
  it('round-trips a user id', () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken('u1', 's'), 's')).toBe('u1')
  })

  it('rejects a tampered id', () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken('u1', 's').replace('u1', 'u2'), 's')).toBeNull()
  })

  it('rejects a token signed with another secret', () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken('u1', 's'), 'other')).toBeNull()
  })

  it('rejects junk without throwing', () => {
    expect(verifyUnsubscribeToken('junk', 's')).toBeNull()
    expect(verifyUnsubscribeToken('', 's')).toBeNull()
    expect(verifyUnsubscribeToken('u1.abc', 's')).toBeNull()
  })

  it('refuses to work without a secret', () => {
    expect(() => createUnsubscribeToken('u1', '')).toThrow()
    expect(verifyUnsubscribeToken('u1.abc', '')).toBeNull()
  })
})
