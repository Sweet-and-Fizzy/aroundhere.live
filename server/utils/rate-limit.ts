/**
 * Simple in-memory rate limiter for API endpoints
 * Tracks request timestamps per key (typically IP address)
 */

const store = new Map<string, number[]>()

// Clean up expired entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000

let cleanupTimer: ReturnType<typeof setInterval> | null = null

function startCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, timestamps] of store) {
      const filtered = timestamps.filter(t => now - t < 3600_000) // Keep last hour max
      if (filtered.length === 0) {
        store.delete(key)
      } else {
        store.set(key, filtered)
      }
    }
  }, CLEANUP_INTERVAL)
  // Don't prevent process exit
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }
}

/**
 * Check if a request is within rate limits
 * @returns true if the request is allowed, false if rate limited
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  startCleanup()

  const now = Date.now()
  const timestamps = store.get(key) || []

  // Filter to only timestamps within the window
  const recent = timestamps.filter(t => now - t < windowMs)

  if (recent.length >= limit) {
    return false
  }

  recent.push(now)
  store.set(key, recent)
  return true
}
