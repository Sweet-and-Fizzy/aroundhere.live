import { getRequestIP } from 'h3'
import prisma from '../utils/prisma'

interface RateLimitConfig {
  // IP-based limits
  maxRequestsPerIpPerHour: number
  maxRequestsPerIpPerMinute: number

  // Session-based limits
  maxRequestsPerSessionPerMinute: number
  maxCostPerSessionPerHour: number // USD
  maxCostPerSessionPerDay: number // USD

  // IP-based cost limits (for users sharing sessions)
  maxCostPerIpPerHour: number
  maxCostPerIpPerDay: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequestsPerIpPerHour: 60,
  maxRequestsPerIpPerMinute: 10,
  maxRequestsPerSessionPerMinute: 5,
  maxCostPerSessionPerHour: 0.50, // $0.50
  maxCostPerSessionPerDay: 2.00,   // $2.00
  maxCostPerIpPerHour: 1.00,       // $1.00
  maxCostPerIpPerDay: 5.00,        // $5.00
}

// In-memory store for rate limiting (could use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function getRateLimitKey(prefix: string, identifier: string, windowMinutes: number): string {
  const now = new Date()
  const windowStart = new Date(now.getTime() - (now.getTime() % (windowMinutes * 60 * 1000)))
  return `${prefix}:${identifier}:${windowStart.getTime()}`
}

function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const resetAt = now + windowMs

  const existing = rateLimitStore.get(key)

  if (!existing || existing.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt }
  }

  existing.count++
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt }
}

async function getCostForSession(sessionId: string, hoursAgo: number): Promise<number> {
  try {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)

    const result = await prisma.chatLog.aggregate({
      where: {
        sessionId,
        timestamp: { gte: since },
      },
      _sum: {
        estimatedCostUsd: true,
      },
    })

    return result._sum.estimatedCostUsd || 0
  } catch (error) {
    console.error('Failed to get cost for session:', error)
    // Fail open - don't block user if DB is down
    return 0
  }
}

async function getCostForIp(ip: string, hoursAgo: number): Promise<number> {
  try {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)

    const result = await prisma.chatLog.aggregate({
      where: {
        ipAddress: ip,
        timestamp: { gte: since },
      },
      _sum: {
        estimatedCostUsd: true,
      },
    })

    return result._sum.estimatedCostUsd || 0
  } catch (error) {
    console.error('Failed to get cost for IP:', error)
    // Fail open - don't block user if DB is down
    return 0
  }
}

export default defineEventHandler(async (event) => {
  // Only apply to chat API endpoint
  if (!event.path.startsWith('/api/chat')) {
    return
  }

  // Skip for non-POST requests
  if (event.method !== 'POST') {
    return
  }

  const config = DEFAULT_CONFIG
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'

  // Read body to get sessionId (if provided)
  let sessionId: string | undefined
  try {
    const body = await readBody(event)
    sessionId = body.sessionId

    // Put body back for the actual handler
    event.context.parsedBody = body
  } catch {
    // Body parsing failed, continue without sessionId
  }

  // IP-based rate limits
  const ipMinuteKey = getRateLimitKey('ip-minute', ip, 1)
  const ipMinuteLimit = checkRateLimit(ipMinuteKey, config.maxRequestsPerIpPerMinute, 60 * 1000)

  if (!ipMinuteLimit.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many requests from this IP. Please try again later.',
      data: {
        retryAfter: Math.ceil((ipMinuteLimit.resetAt - Date.now()) / 1000),
      },
    })
  }

  const ipHourKey = getRateLimitKey('ip-hour', ip, 60)
  const ipHourLimit = checkRateLimit(ipHourKey, config.maxRequestsPerIpPerHour, 60 * 60 * 1000)

  if (!ipHourLimit.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Hourly request limit exceeded. Please try again later.',
      data: {
        retryAfter: Math.ceil((ipHourLimit.resetAt - Date.now()) / 1000),
      },
    })
  }

  // Session-based rate limits (if sessionId provided)
  if (sessionId) {
    const sessionMinuteKey = getRateLimitKey('session-minute', sessionId, 1)
    const sessionMinuteLimit = checkRateLimit(sessionMinuteKey, config.maxRequestsPerSessionPerMinute, 60 * 1000)

    if (!sessionMinuteLimit.allowed) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Too many messages in quick succession. Please slow down.',
        data: {
          retryAfter: Math.ceil((sessionMinuteLimit.resetAt - Date.now()) / 1000),
        },
      })
    }

    // Cost-based limits for session
    const sessionCostHour = await getCostForSession(sessionId, 1)
    if (sessionCostHour >= config.maxCostPerSessionPerHour) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Hourly usage limit reached for this conversation. Please start a new session later.',
        data: {
          limitType: 'cost',
          currentCost: sessionCostHour,
          limit: config.maxCostPerSessionPerHour,
        },
      })
    }

    const sessionCostDay = await getCostForSession(sessionId, 24)
    if (sessionCostDay >= config.maxCostPerSessionPerDay) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Daily usage limit reached for this conversation. Please try again tomorrow.',
        data: {
          limitType: 'cost',
          currentCost: sessionCostDay,
          limit: config.maxCostPerSessionPerDay,
        },
      })
    }
  }

  // IP-based cost limits (prevents abuse via multiple sessions)
  const ipCostHour = await getCostForIp(ip, 1)
  if (ipCostHour >= config.maxCostPerIpPerHour) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Hourly usage limit reached. Please try again later.',
      data: {
        limitType: 'cost',
        currentCost: ipCostHour,
        limit: config.maxCostPerIpPerHour,
      },
    })
  }

  const ipCostDay = await getCostForIp(ip, 24)
  if (ipCostDay >= config.maxCostPerIpPerDay) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Daily usage limit reached. Please try again tomorrow.',
      data: {
        limitType: 'cost',
        currentCost: ipCostDay,
        limit: config.maxCostPerIpPerDay,
      },
    })
  }

  // Add rate limit headers
  setHeader(event, 'X-RateLimit-Limit-Minute', config.maxRequestsPerIpPerMinute.toString())
  setHeader(event, 'X-RateLimit-Remaining-Minute', ipMinuteLimit.remaining.toString())
  setHeader(event, 'X-RateLimit-Reset', new Date(ipMinuteLimit.resetAt).toISOString())
})

// Cleanup old entries periodically (call this from a cron job or scheduled task)
export function cleanupRateLimitStore() {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}
