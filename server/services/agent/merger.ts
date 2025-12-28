/**
 * Data Merger
 * Intelligently merges data from multiple scraper attempts
 */

import type { VenueInfo } from './types'

export interface MergeResult {
  mergedData: VenueInfo
  conflicts: Array<{
    field: string
    values: Array<{ attemptNumber: number; value: unknown }>
  }>
  sources: Record<string, number> // field -> attempt number that provided it
}

/**
 * Merge venue data from multiple attempts
 * Strategy:
 * 1. For each field, collect all non-empty values across attempts
 * 2. If all attempts agree, use that value
 * 3. If attempts disagree, flag as conflict and prefer later attempts (more refined)
 * 4. Track which attempt each field came from
 */
export function mergeVenueData(attempts: Array<{
  attemptNumber: number
  scrapedData: VenueInfo
}>): MergeResult {
  const mergedData: VenueInfo = {}
  const conflicts: Array<{
    field: string
    values: Array<{ attemptNumber: number; value: unknown }>
  }> = []
  const sources: Record<string, number> = {}

  // Get all possible fields
  const allFields = new Set<string>()
  attempts.forEach((attempt) => {
    Object.keys(attempt.scrapedData).forEach((field) => allFields.add(field))
  })

  // Process each field
  for (const field of allFields) {
    const values: Array<{ attemptNumber: number; value: unknown }> = []

    // Collect all non-empty values for this field
    attempts.forEach((attempt) => {
      const value = attempt.scrapedData[field as keyof VenueInfo]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        values.push({
          attemptNumber: attempt.attemptNumber,
          value,
        })
      }
    })

    if (values.length === 0) {
      // No values found for this field
      continue
    }

    if (values.length === 1) {
      // Only one attempt provided this field - use it
      ;(mergedData as Record<string, unknown>)[field] = values[0]!.value
      sources[field] = values[0]!.attemptNumber
      continue
    }

    // Multiple values - check if they all agree
    const uniqueValues = new Set(values.map((v) => JSON.stringify(v.value)))
    const latestValue = values[values.length - 1]!

    if (uniqueValues.size === 1) {
      // All attempts agree on this value
      ;(mergedData as Record<string, unknown>)[field] = values[0]!.value
      sources[field] = latestValue.attemptNumber // Credit last attempt
    } else {
      // Conflict! Different attempts extracted different values
      conflicts.push({ field, values })

      // Prefer the value from the latest attempt (most refined code)
      ;(mergedData as Record<string, unknown>)[field] = latestValue.value
      sources[field] = latestValue.attemptNumber
    }
  }

  return {
    mergedData,
    conflicts,
    sources,
  }
}

/**
 * Compare two venue data objects and return differences
 */
export function compareVenueData(
  data1: VenueInfo,
  data2: VenueInfo
): Array<{ field: string; value1: unknown; value2: unknown }> {
  const differences: Array<{ field: string; value1: unknown; value2: unknown }> = []
  const allFields = new Set([...Object.keys(data1), ...Object.keys(data2)])

  for (const field of allFields) {
    const value1 = data1[field as keyof VenueInfo]
    const value2 = data2[field as keyof VenueInfo]

    if (JSON.stringify(value1) !== JSON.stringify(value2)) {
      differences.push({ field, value1, value2 })
    }
  }

  return differences
}
