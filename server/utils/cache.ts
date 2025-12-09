import type { H3Event } from 'h3'

/**
 * Default cache duration in seconds (30 minutes)
 * Can be overridden via CACHE_MAX_AGE environment variable
 */
const DEFAULT_CACHE_SECONDS = 30 * 60

/**
 * Set cache headers for public API responses
 * Duration can be configured via CACHE_MAX_AGE env var (in seconds)
 */
export function setCacheHeaders(event: H3Event, maxAgeSeconds?: number) {
  const envCacheSeconds = parseInt(process.env.CACHE_MAX_AGE || '') || DEFAULT_CACHE_SECONDS
  const cacheSeconds = maxAgeSeconds ?? envCacheSeconds
  setHeader(event, 'Cache-Control', `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`)
}
