/**
 * Field Evaluator
 * Evaluates completeness of scraped data
 */

import type { FieldEvaluationResult, VenueInfo } from './types'
import {
  VENUE_REQUIRED_FIELDS,
  VENUE_OPTIONAL_FIELDS,
  EVENT_REQUIRED_FIELDS,
  EVENT_OPTIONAL_FIELDS,
} from './types'

// Common time patterns that shouldn't appear in titles
const TIME_PATTERNS = [
  /\b\d{1,2}:\d{2}\s*(am|pm|AM|PM)\b/,           // 7:30pm, 7:30 PM
  /\b\d{1,2}\s*(am|pm|AM|PM)\b/,                  // 7pm, 7 PM
  /\b\d{1,2}:\d{2}\b/,                            // 19:30
  /\b(doors|show|starts?)\s*[@:]\s*\d/i,          // doors @ 7, show: 8
  /\b\d{1,2}\s*(o'?clock)\b/i,                    // 7 o'clock
]

interface DataQualityIssue {
  field: string
  issue: string
  value: string
  suggestion: string
}

/**
 * Check for common data quality issues in event data
 */
function detectEventQualityIssues(event: Record<string, unknown>): DataQualityIssue[] {
  const issues: DataQualityIssue[] = []

  // Check for time patterns in title
  if (event.title && typeof event.title === 'string') {
    for (const pattern of TIME_PATTERNS) {
      const match = event.title.match(pattern)
      if (match) {
        issues.push({
          field: 'title',
          issue: 'contains_time',
          value: event.title,
          suggestion: `Title "${event.title}" contains time pattern "${match[0]}". Extract the time into startsAt/doorsAt fields instead.`,
        })
        break
      }
    }

    // Check for date patterns in title
    const datePattern = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i
    const dateMatch = event.title.match(datePattern)
    if (dateMatch) {
      issues.push({
        field: 'title',
        issue: 'contains_date',
        value: event.title,
        suggestion: `Title "${event.title}" contains date pattern "${dateMatch[0]}". This should be in the startsAt field.`,
      })
    }
  }

  // Check for invalid/past dates
  if (event.startsAt) {
    try {
      const date = new Date(event.startsAt as string | number | Date)
      const now = new Date()
      const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      if (date < oneWeekAgo) {
        issues.push({
          field: 'startsAt',
          issue: 'past_date',
          value: date.toISOString(),
          suggestion: `Event date ${date.toISOString()} is in the past. Check date parsing logic.`,
        })
      } else if (date > oneYearFromNow) {
        issues.push({
          field: 'startsAt',
          issue: 'far_future_date',
          value: date.toISOString(),
          suggestion: `Event date ${date.toISOString()} is more than a year away. This may indicate a date parsing error.`,
        })
      }
    } catch {
      // Invalid date handled elsewhere
    }
  }

  // Check for suspicious coverCharge values
  if (event.coverCharge !== undefined && event.coverCharge !== null) {
    const charge = Number(event.coverCharge)
    if (isNaN(charge)) {
      issues.push({
        field: 'coverCharge',
        issue: 'not_a_number',
        value: String(event.coverCharge),
        suggestion: `coverCharge "${event.coverCharge}" is not a valid number. Extract just the numeric value.`,
      })
    } else if (charge < 0 || charge > 500) {
      issues.push({
        field: 'coverCharge',
        issue: 'unrealistic_value',
        value: String(event.coverCharge),
        suggestion: `coverCharge ${charge} seems unrealistic. Typical range is $0-$100.`,
      })
    }
  }

  return issues
}

/**
 * Format a sample of extracted data for feedback
 */
function formatEventSample(events: Record<string, unknown>[], maxEvents: number = 2): string {
  if (!events || events.length === 0) return ''

  const sample = events.slice(0, maxEvents)
  const lines: string[] = ['', 'Sample of extracted data:']

  for (let i = 0; i < sample.length; i++) {
    const event = sample[i]
    lines.push(`  Event ${i + 1}:`)

    // Show key fields with truncation for long values
    const fieldsToShow = ['title', 'startsAt', 'sourceUrl', 'doorsAt', 'coverCharge', 'description']
    for (const field of fieldsToShow) {
      if (event[field] !== undefined && event[field] !== null) {
        let value = event[field]
        if (value instanceof Date || (typeof value === 'object' && value !== null && (value as { constructor?: { name?: string } }).constructor?.name === 'Date')) {
          value = new Date(value as string | number | Date).toISOString()
        } else if (typeof value === 'string' && value.length > 80) {
          value = value.substring(0, 77) + '...'
        }
        lines.push(`    ${field}: ${JSON.stringify(value)}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * Evaluate venue information completeness
 */
export function evaluateVenueData(venueData: VenueInfo | null | undefined): FieldEvaluationResult {
  const fieldsFound: string[] = []
  const fieldsMissing: string[] = []
  const requiredFieldsMissing: string[] = []

  if (!venueData) {
    return {
      fieldsFound: [],
      fieldsMissing: [...VENUE_REQUIRED_FIELDS, ...VENUE_OPTIONAL_FIELDS],
      requiredFieldsMissing: VENUE_REQUIRED_FIELDS,
      completenessScore: 0,
      isAcceptable: false,
      feedback: 'No venue data was extracted. The scraper may have failed or returned null.',
    }
  }

  // Check required fields
  for (const field of VENUE_REQUIRED_FIELDS) {
    const value = venueData[field as keyof VenueInfo]
    if (value && String(value).trim().length > 0) {
      fieldsFound.push(field)
    } else {
      fieldsMissing.push(field)
      requiredFieldsMissing.push(field)
    }
  }

  // Check optional fields
  for (const field of VENUE_OPTIONAL_FIELDS) {
    const value = venueData[field as keyof VenueInfo]
    if (value && String(value).trim().length > 0) {
      fieldsFound.push(field)
    } else {
      fieldsMissing.push(field)
    }
  }

  // Calculate completeness score
  const totalFields = VENUE_REQUIRED_FIELDS.length + VENUE_OPTIONAL_FIELDS.length
  const completenessScore = fieldsFound.length / totalFields

  // Acceptable if all required fields are present
  const isAcceptable = requiredFieldsMissing.length === 0

  // Generate feedback
  let feedback = ''
  if (requiredFieldsMissing.length > 0) {
    feedback += `Missing required fields: ${requiredFieldsMissing.join(', ')}. `
  }

  const optionalMissing = fieldsMissing.filter((f) => !requiredFieldsMissing.includes(f))
  if (optionalMissing.length > 0) {
    feedback += `Missing optional fields: ${optionalMissing.join(', ')}. `
  }

  if (isAcceptable) {
    feedback = `All required fields found! ${fieldsFound.length}/${totalFields} total fields extracted. `
    if (optionalMissing.length > 0) {
      feedback += `Consider extracting these additional fields: ${optionalMissing.slice(0, 3).join(', ')}.`
    }
  }

  return {
    fieldsFound,
    fieldsMissing,
    requiredFieldsMissing,
    completenessScore,
    isAcceptable,
    feedback: feedback.trim(),
  }
}

/**
 * Evaluate event data completeness
 * Checks if events array has valid events with required fields
 */
export function evaluateEventData(events: Record<string, unknown>[] | null | undefined): FieldEvaluationResult {
  if (!events || !Array.isArray(events) || events.length === 0) {
    return {
      fieldsFound: [],
      fieldsMissing: [...EVENT_REQUIRED_FIELDS, ...EVENT_OPTIONAL_FIELDS],
      requiredFieldsMissing: EVENT_REQUIRED_FIELDS,
      completenessScore: 0,
      isAcceptable: false,
      feedback: 'No events were extracted. The scraper may have failed or found no events on the page.',
    }
  }

  // Analyze the first few events to determine field coverage
  const sampleSize = Math.min(3, events.length)
  const fieldCounts: Record<string, number> = {}

  // Collect quality issues across sample events
  const allQualityIssues: DataQualityIssue[] = []

  for (let i = 0; i < sampleSize; i++) {
    const event = events[i]

    // Check for quality issues
    const issues = detectEventQualityIssues(event)
    allQualityIssues.push(...issues)

    // Check required fields
    for (const field of EVENT_REQUIRED_FIELDS) {
      const value = event[field]
      if (value !== undefined && value !== null) {
        // Special handling for dates - check for Date-like objects from VM sandbox
        if (field === 'startsAt') {
          const isValidDate = (value instanceof Date && !isNaN(value.getTime())) ||
            (typeof value === 'object' && (value as { constructor?: { name?: string } }).constructor?.name === 'Date' && !isNaN(new Date(value as string | number | Date).getTime())) ||
            (typeof value === 'string' && !isNaN(Date.parse(value)))
          if (isValidDate) {
            fieldCounts[field] = (fieldCounts[field] || 0) + 1
          }
        } else if (String(value).trim().length > 0) {
          fieldCounts[field] = (fieldCounts[field] || 0) + 1
        }
      }
    }

    // Check optional fields
    for (const field of EVENT_OPTIONAL_FIELDS) {
      const value = event[field]
      if (value !== undefined && value !== null) {
        if (field === 'doorsAt' || field === 'endsAt') {
          // Handle Date-like objects from VM sandbox
          const isValidDate = (value instanceof Date && !isNaN(value.getTime())) ||
            (typeof value === 'object' && (value as { constructor?: { name?: string } }).constructor?.name === 'Date' && !isNaN(new Date(value as string | number | Date).getTime())) ||
            (typeof value === 'string' && !isNaN(Date.parse(value)))
          if (isValidDate) {
            fieldCounts[field] = (fieldCounts[field] || 0) + 1
          }
        } else if (Array.isArray(value) && value.length > 0) {
          fieldCounts[field] = (fieldCounts[field] || 0) + 1
        } else if (String(value).trim().length > 0) {
          fieldCounts[field] = (fieldCounts[field] || 0) + 1
        }
      }
    }
  }

  // Determine which fields are consistently found (in at least 50% of sample)
  const threshold = sampleSize / 2
  const fieldsFound: string[] = []
  const fieldsMissing: string[] = []
  const requiredFieldsMissing: string[] = []

  for (const field of EVENT_REQUIRED_FIELDS) {
    if ((fieldCounts[field] || 0) >= threshold) {
      fieldsFound.push(field)
    } else {
      fieldsMissing.push(field)
      requiredFieldsMissing.push(field)
    }
  }

  for (const field of EVENT_OPTIONAL_FIELDS) {
    if ((fieldCounts[field] || 0) >= threshold) {
      fieldsFound.push(field)
    } else {
      fieldsMissing.push(field)
    }
  }

  // Calculate completeness
  const totalFields = EVENT_REQUIRED_FIELDS.length + EVENT_OPTIONAL_FIELDS.length
  const completenessScore = fieldsFound.length / totalFields

  // Check for quality issues that should prevent acceptance
  const hasTimeInTitle = allQualityIssues.some(i => i.issue === 'contains_time')
  const hasPastDates = allQualityIssues.some(i => i.issue === 'past_date')

  // Acceptable if all required fields present and at least 30% of optional fields
  // AND no critical quality issues
  const hasRequiredFields = requiredFieldsMissing.length === 0
  const optionalFieldsFound = fieldsFound.filter((f) => !EVENT_REQUIRED_FIELDS.includes(f)).length
  const optionalFieldsRatio = optionalFieldsFound / EVENT_OPTIONAL_FIELDS.length

  const meetsFieldRequirements = hasRequiredFields && optionalFieldsRatio >= 0.3
  const hasQualityIssues = hasTimeInTitle || hasPastDates
  const isAcceptable = meetsFieldRequirements && !hasQualityIssues

  // Generate feedback
  let feedback = `Found ${events.length} events. `

  if (requiredFieldsMissing.length > 0) {
    feedback += `Missing required fields in events: ${requiredFieldsMissing.join(', ')}. `
  }

  // Add quality issue feedback (deduplicated by issue type)
  const uniqueIssues = new Map<string, DataQualityIssue>()
  for (const issue of allQualityIssues) {
    const key = `${issue.field}:${issue.issue}`
    if (!uniqueIssues.has(key)) {
      uniqueIssues.set(key, issue)
    }
  }

  if (uniqueIssues.size > 0) {
    feedback += '\n\nDATA QUALITY ISSUES FOUND:\n'
    for (const issue of uniqueIssues.values()) {
      feedback += `- ${issue.suggestion}\n`
    }
  }

  const optionalMissing = fieldsMissing.filter((f) => !requiredFieldsMissing.includes(f))
  if (!meetsFieldRequirements && optionalMissing.length > 0) {
    feedback += `\nLow coverage of optional fields. Missing: ${optionalMissing.slice(0, 5).join(', ')}. `
  }

  // Add sample of extracted data to help LLM understand what was found
  feedback += formatEventSample(events)

  if (isAcceptable) {
    feedback = `Successfully extracted ${events.length} events with ${fieldsFound.length}/${totalFields} fields. `
    if (optionalMissing.length > 0 && optionalMissing.length <= 5) {
      feedback += `Consider adding: ${optionalMissing.join(', ')}.`
    }
  }

  return {
    fieldsFound,
    fieldsMissing,
    requiredFieldsMissing,
    completenessScore,
    isAcceptable,
    feedback: feedback.trim(),
  }
}
