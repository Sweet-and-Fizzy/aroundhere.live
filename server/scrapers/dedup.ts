import type { PrismaClient } from '@prisma/client'
import type { ScrapedEvent } from './types'
import { normalizeForComparison, cleanEventTitle } from '../utils/html'

/**
 * Extract the headliner from an event title by removing opener patterns.
 * Common patterns:
 *   - "Headliner w/ Opener"
 *   - "Headliner with Opener"
 *   - "Headliner feat. Opener"
 *   - "Headliner featuring Opener"
 *   - "Headliner & Opener" (only at end)
 *   - "Headliner + Opener"
 */
function extractHeadliner(title: string): string {
  // Patterns that indicate an opener follows (case insensitive)
  // Note: Some patterns allow optional space after separator (e.g., "w/Opener" or "w/ Opener")
  const openerPatterns = [
    /\s+w\/\s*.+$/i, // "w/ Opener" or "w/Opener"
    /\s+with\s+.+$/i, // "with Opener"
    /\s+feat\.?\s*.+$/i, // "feat. Opener" or "feat Opener"
    /\s+featuring\s+.+$/i, // "featuring Opener"
    /\s+\+\s*.+$/i, // "+ Opener" or "+Opener"
    /\s+and\s+.+$/i, // "and Opener" (at end only)
  ]

  let headliner = title
  for (const pattern of openerPatterns) {
    headliner = headliner.replace(pattern, '')
  }

  return headliner.trim()
}

/**
 * Fuzzy string matching for event titles.
 * Uses multiple strategies to catch duplicates:
 * 1. Direct Levenshtein similarity
 * 2. Headliner extraction (handles "Artist w/ Opener" patterns)
 * 3. Prefix matching (one title starts with the other)
 */
export function similarityScore(str1: string, str2: string): number {
  const s1 = normalizeForComparison(str1)
  const s2 = normalizeForComparison(str2)

  if (s1 === s2) return 1.0

  // Strategy 1: Standard Levenshtein distance based similarity
  const levenshteinSimilarity = calculateLevenshteinSimilarity(s1, s2)

  // Strategy 2: Extract headliners and compare
  // This catches "Deer Tick" vs "Deer Tick w/ Perennial"
  const h1 = normalizeForComparison(extractHeadliner(str1))
  const h2 = normalizeForComparison(extractHeadliner(str2))

  let headlinerSimilarity = 0
  if (h1 !== s1 || h2 !== s2) {
    // At least one title had an opener stripped
    headlinerSimilarity = calculateLevenshteinSimilarity(h1, h2)
    // If headliners match well, boost the score
    if (headlinerSimilarity >= 0.9) {
      // Headliners are nearly identical, this is likely the same event
      headlinerSimilarity = Math.max(headlinerSimilarity, 0.85)
    }
  }

  // Strategy 3: Check if shorter string is a prefix of longer
  // This catches cases where one title is just an extended version
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1
  let prefixSimilarity = 0
  if (shorter.length >= 5 && longer.startsWith(shorter)) {
    // Shorter is a prefix of longer - likely same event with added info
    // Score based on how much of the longer string is covered
    prefixSimilarity = shorter.length / longer.length
    // Boost if prefix covers significant portion
    if (prefixSimilarity >= 0.5) {
      prefixSimilarity = Math.max(prefixSimilarity, 0.8)
    }
  }

  // Return the highest similarity from all strategies
  return Math.max(levenshteinSimilarity, headlinerSimilarity, prefixSimilarity)
}

function calculateLevenshteinSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0

  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1

  if (longer.length === 0) return 1.0

  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  const dp: number[][] = []

  for (let i = 0; i <= m; i++) {
    dp[i] = []
    for (let j = 0; j <= n; j++) {
      dp[i]![j] = 0
    }
  }

  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
      }
    }
  }

  return dp[m]![n]!
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
  // Clean both titles to remove date prefixes, time suffixes, etc. that may differ
  // between scraped and stored versions
  const SIMILARITY_THRESHOLD = 0.7
  const cleanedScrapedTitle = cleanEventTitle(scrapedEvent.title)

  for (const existing of potentialMatches) {
    // Compare cleaned titles - existing.title is already cleaned when saved
    const similarity = similarityScore(cleanedScrapedTitle, existing.title)

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
      const isSameSource = existing.sourceId === sourceId

      return {
        isDuplicate: true,
        existingEventId: existing.id,
        // Update canonical if: same source (re-scrape), OR higher priority source
        shouldUpdateCanonical: isSameSource || sourcePriority < existingPriority,
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
