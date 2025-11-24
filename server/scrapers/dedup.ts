import type { PrismaClient } from '@prisma/client'
import type { ScrapedEvent } from './types'

// Fuzzy string matching for titles
export function similarityScore(str1: string, str2: string): number {
  const s1 = normalizeTitle(str1)
  const s2 = normalizeTitle(str2)

  if (s1 === s2) return 1.0

  // Levenshtein distance based similarity
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1

  if (longer.length === 0) return 1.0

  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return dp[m][n]
}

// Check if two dates are the same day
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

export interface DedupResult {
  isDuplicate: boolean
  existingEventId?: string
  shouldUpdateCanonical: boolean // True if new source has higher priority
  similarity: number
}

export async function findDuplicate(
  prisma: PrismaClient,
  scrapedEvent: ScrapedEvent,
  venueId: string,
  sourceId: string,
  sourcePriority: number
): Promise<DedupResult> {
  // Find events at the same venue on the same day
  const startOfDay = new Date(scrapedEvent.startsAt)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(scrapedEvent.startsAt)
  endOfDay.setHours(23, 59, 59, 999)

  const potentialMatches = await prisma.event.findMany({
    where: {
      venueId,
      startsAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      source: true,
    },
  })

  // Check each potential match for title similarity
  const SIMILARITY_THRESHOLD = 0.7

  for (const existing of potentialMatches) {
    const similarity = similarityScore(scrapedEvent.title, existing.title)

    if (similarity >= SIMILARITY_THRESHOLD) {
      // Check if times are significantly different - could be matinee vs evening show
      const timeDiffHours = Math.abs(
        scrapedEvent.startsAt.getTime() - existing.startsAt.getTime()
      ) / (1000 * 60 * 60)

      // If events are more than 2 hours apart and similarity isn't perfect,
      // they're likely different shows (matinee vs evening)
      if (timeDiffHours > 2 && similarity < 0.95) {
        console.log(`[Dedup] Skipping potential match - different showtimes: "${scrapedEvent.title}" vs "${existing.title}" (${timeDiffHours.toFixed(1)}h apart)`)
        continue
      }

      // Found a duplicate
      const existingPriority = existing.source?.priority ?? 50

      return {
        isDuplicate: true,
        existingEventId: existing.id,
        shouldUpdateCanonical: sourcePriority < existingPriority,
        similarity,
      }
    }
  }

  return {
    isDuplicate: false,
    shouldUpdateCanonical: false,
    similarity: 0,
  }
}

// Merge data from a lower-priority source into an existing event
export function mergeEventData(
  existing: {
    title: string
    description?: string | null
    imageUrl?: string | null
    coverCharge?: string | null
    ticketUrl?: string | null
    doorsAt?: Date | null
    endsAt?: Date | null
  },
  scraped: ScrapedEvent
): Partial<ScrapedEvent> {
  const updates: Partial<ScrapedEvent> = {}

  // Only fill in missing fields, don't override existing
  if (!existing.description && scraped.description) {
    updates.description = scraped.description
  }
  if (!existing.imageUrl && scraped.imageUrl) {
    updates.imageUrl = scraped.imageUrl
  }
  if (!existing.coverCharge && scraped.coverCharge) {
    updates.coverCharge = scraped.coverCharge
  }
  if (!existing.ticketUrl && scraped.ticketUrl) {
    updates.ticketUrl = scraped.ticketUrl
  }
  if (!existing.doorsAt && scraped.doorsAt) {
    updates.doorsAt = scraped.doorsAt
  }
  if (!existing.endsAt && scraped.endsAt) {
    updates.endsAt = scraped.endsAt
  }

  return updates
}
