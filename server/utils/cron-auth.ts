/**
 * Cron endpoint authentication
 *
 * Validates requests to cron endpoints using a secret token.
 * The token can be passed via:
 *   - Query parameter: ?token=xxx
 *   - Authorization header: Bearer xxx
 *
 * Set CRON_SECRET in environment variables.
 *
 * Example crontab usage:
 *   0 8 * * * curl -sX POST "https://aroundhere.live/api/cron/chat-summary?token=$CRON_SECRET"
 *
 * Or with header:
 *   0 8 * * * curl -sX POST -H "Authorization: Bearer $CRON_SECRET" https://aroundhere.live/api/cron/chat-summary
 */

import type { H3Event } from 'h3'

/**
 * Verify that a cron request has valid authentication
 * @returns true if authenticated, throws error if not
 */
export function verifyCronAuth(event: H3Event): boolean {
  const cronSecret = process.env.CRON_SECRET

  // If no secret is configured, allow all requests (for local development)
  if (!cronSecret) {
    console.warn('[Cron Auth] CRON_SECRET not set - allowing unauthenticated request')
    return true
  }

  // Check query parameter
  const query = getQuery(event)
  if (query.token === cronSecret) {
    return true
  }

  // Check Authorization header
  const authHeader = getHeader(event, 'authorization')
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ')
    if (scheme?.toLowerCase() === 'bearer' && token === cronSecret) {
      return true
    }
  }

  // Authentication failed
  throw createError({
    statusCode: 401,
    statusMessage: 'Unauthorized - Invalid or missing cron token',
  })
}
