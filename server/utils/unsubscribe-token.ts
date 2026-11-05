import { createHmac, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'

function sign(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(userId).digest('hex')
}

/** A signed, non-expiring token, so an email link can unsubscribe without a login. */
export function createUnsubscribeToken(userId: string, secret: string): string {
  if (!secret) throw new Error('An unsubscribe secret is required')
  return `${userId}.${sign(userId, secret)}`
}

/** Returns the user id, or null if the token isn't valid. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const separator = token.lastIndexOf('.')
  if (!secret || separator < 1) return null

  const userId = token.slice(0, separator)
  const given = Buffer.from(token.slice(separator + 1))
  const expected = Buffer.from(sign(userId, secret))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  return userId
}
