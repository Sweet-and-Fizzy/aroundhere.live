/**
 * Simple in-memory alert deduplication
 * Prevents spamming Slack with repeated alerts within a time window
 */

interface AlertRecord {
  lastSent: number
  count: number
}

// In-memory cache of recently sent alerts
// Key format: "{alertType}:{severity}" or "{alertType}:{severity}:{identifier}"
const alertCache = new Map<string, AlertRecord>()

// Default cooldown period in milliseconds (1 hour)
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000

// Cleanup old entries every 10 minutes
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000

/**
 * Check if we should send an alert, or if it's been sent too recently
 * @param alertKey Unique key for this alert type (e.g., "cost:warning:daily")
 * @param cooldownMs How long to wait before sending the same alert again
 * @returns true if alert should be sent, false if it was recently sent
 */
export function shouldSendAlert(
  alertKey: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): boolean {
  const now = Date.now()
  const record = alertCache.get(alertKey)

  if (!record) {
    // First time seeing this alert
    alertCache.set(alertKey, { lastSent: now, count: 1 })
    return true
  }

  if (now - record.lastSent >= cooldownMs) {
    // Cooldown period has passed
    alertCache.set(alertKey, { lastSent: now, count: record.count + 1 })
    return true
  }

  // Alert was sent recently, increment suppressed count but don't send
  record.count++
  return false
}

/**
 * Get the number of times an alert was suppressed since last send
 */
export function getSuppressedCount(alertKey: string): number {
  const record = alertCache.get(alertKey)
  return record ? record.count - 1 : 0
}

/**
 * Build a standardized alert key
 */
export function buildAlertKey(
  type: string,
  severity: string,
  identifier?: string
): string {
  const parts = [type, severity]
  if (identifier) {
    parts.push(identifier)
  }
  return parts.join(':')
}

// Periodic cleanup of old entries to prevent memory leak
let cleanupInterval: ReturnType<typeof setInterval> | null = null

function startCleanup() {
  if (cleanupInterval) return

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    const maxAge = DEFAULT_COOLDOWN_MS * 2 // Keep records for 2x the cooldown

    for (const [key, record] of alertCache.entries()) {
      if (now - record.lastSent > maxAge) {
        alertCache.delete(key)
      }
    }
  }, CLEANUP_INTERVAL_MS)

  // Don't prevent process from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref()
  }
}

// Start cleanup on module load
startCleanup()
