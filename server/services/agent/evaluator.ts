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
export function evaluateEventData(events: any[] | null | undefined): FieldEvaluationResult {
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

  for (let i = 0; i < sampleSize; i++) {
    const event = events[i]

    // Check required fields
    for (const field of EVENT_REQUIRED_FIELDS) {
      const value = event[field]
      if (value !== undefined && value !== null) {
        // Special handling for dates - check for Date-like objects from VM sandbox
        if (field === 'startsAt') {
          const isValidDate = (value instanceof Date && !isNaN(value.getTime())) ||
            (typeof value === 'object' && value.constructor?.name === 'Date' && !isNaN(new Date(value).getTime())) ||
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
            (typeof value === 'object' && value.constructor?.name === 'Date' && !isNaN(new Date(value).getTime())) ||
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

  // Acceptable if all required fields present and at least 40% of optional fields
  const hasRequiredFields = requiredFieldsMissing.length === 0
  const optionalFieldsFound = fieldsFound.filter((f) => !EVENT_REQUIRED_FIELDS.includes(f)).length
  const optionalFieldsRatio = optionalFieldsFound / EVENT_OPTIONAL_FIELDS.length

  const isAcceptable = hasRequiredFields && optionalFieldsRatio >= 0.3

  // Generate feedback
  let feedback = `Found ${events.length} events. `

  if (requiredFieldsMissing.length > 0) {
    feedback += `Missing required fields in events: ${requiredFieldsMissing.join(', ')}. `
  }

  const optionalMissing = fieldsMissing.filter((f) => !requiredFieldsMissing.includes(f))
  if (!isAcceptable && optionalMissing.length > 0) {
    feedback += `Low coverage of optional fields. Missing: ${optionalMissing.slice(0, 5).join(', ')}. `
  }

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
