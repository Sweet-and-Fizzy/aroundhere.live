import { createError, getRequestIP, type H3Event } from 'h3'
import { checkRateLimit } from './rate-limit'

const HOUR_MS = 60 * 60 * 1000
const MAX_PER_EMAIL_PER_HOUR = 3
const MAX_PER_IP_PER_HOUR = 10

/**
 * Limit an auth action that can send mail to an address the caller doesn't have
 * to own. Abuse here would cost us sender reputation for every email we send.
 */
export function enforceAuthRateLimit(
  event: H3Event,
  action: 'magic-link' | 'register' | 'password-reset',
  email: string,
): void {
  const ip = getRequestIP(event, { xForwardedFor: true })
  const allowed = (!ip || checkRateLimit(`${action}:ip:${ip}`, MAX_PER_IP_PER_HOUR, HOUR_MS))
    && checkRateLimit(`${action}:email:${email}`, MAX_PER_EMAIL_PER_HOUR, HOUR_MS)

  if (!allowed) {
    throw createError({ statusCode: 429, message: 'Too many requests. Please try again later.' })
  }
}
