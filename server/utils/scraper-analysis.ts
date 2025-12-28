/**
 * Scraper Analysis Utilities
 * Analyze field coverage and completeness of scraped event data
 */

export interface ScrapedEvent {
  title?: string | null
  startsAt?: string | Date | null
  sourceUrl?: string | null
  description?: string | null
  coverCharge?: string | null
  imageUrl?: string | null
  doorsAt?: string | Date | null
  endsAt?: string | Date | null
  ticketUrl?: string | null
  genres?: string[] | null
  artists?: string[] | null
  ageRestriction?: string | null
  [key: string]: unknown
}

export interface FieldCoverage {
  field: string
  count: number
  percentage: number
  isRequired: boolean
}

export interface FieldsAnalysis {
  coverage: Record<string, FieldCoverage>
  completenessScore: number
  requiredFieldsCoverage: number
  optionalFieldsCoverage: number
}

// Define which fields are required vs optional
const REQUIRED_FIELDS = ['title', 'startsAt', 'sourceUrl']
const OPTIONAL_FIELDS = [
  'description',
  'coverCharge',
  'imageUrl',
  'doorsAt',
  'endsAt',
  'ticketUrl',
  'genres',
  'artists',
  'ageRestriction',
]

/**
 * Check if a field has a meaningful value
 */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string' && value.trim() === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  return true
}

/**
 * Analyze field coverage across scraped events
 */
export function analyzeEventFields(events: ScrapedEvent[]): FieldsAnalysis {
  if (!events || events.length === 0) {
    return {
      coverage: {},
      completenessScore: 0,
      requiredFieldsCoverage: 0,
      optionalFieldsCoverage: 0,
    }
  }

  const coverage: Record<string, FieldCoverage> = {}
  const allFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]

  // Calculate coverage for each field
  for (const field of allFields) {
    const count = events.filter(event => hasValue(event[field])).length
    const percentage = (count / events.length) * 100
    const isRequired = REQUIRED_FIELDS.includes(field)

    coverage[field] = {
      field,
      count,
      percentage,
      isRequired,
    }
  }

  // Calculate required fields coverage
  const requiredCoverage = REQUIRED_FIELDS.map(f => coverage[f]?.percentage ?? 0)
  const requiredFieldsCoverage = requiredCoverage.reduce((sum, p) => sum + p, 0) / REQUIRED_FIELDS.length

  // Calculate optional fields coverage
  const optionalCoverage = OPTIONAL_FIELDS.map(f => coverage[f]?.percentage ?? 0)
  const optionalFieldsCoverage = optionalCoverage.reduce((sum, p) => sum + p, 0) / OPTIONAL_FIELDS.length

  // Overall completeness score (weighted: 70% required, 30% optional)
  const completenessScore = (requiredFieldsCoverage * 0.7 + optionalFieldsCoverage * 0.3) / 100

  return {
    coverage,
    completenessScore,
    requiredFieldsCoverage: requiredFieldsCoverage / 100,
    optionalFieldsCoverage: optionalFieldsCoverage / 100,
  }
}

/**
 * Identify missing required fields across events
 */
export function findMissingRequiredFields(events: ScrapedEvent[]): string[] {
  const analysis = analyzeEventFields(events)
  const missingFields: string[] = []

  for (const field of REQUIRED_FIELDS) {
    // Handle empty coverage (when events array is empty)
    if (analysis.coverage[field] && analysis.coverage[field].percentage < 100) {
      missingFields.push(field)
    }
  }

  return missingFields
}

/**
 * Get a sample of events with best coverage (for preview display)
 */
export function getSampleEvents(events: ScrapedEvent[], limit: number = 5): ScrapedEvent[] {
  if (events.length <= limit) {
    return events
  }

  // Score each event by field coverage
  const scoredEvents = events.map(event => {
    const allFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]
    const filledFields = allFields.filter(f => hasValue(event[f])).length
    const score = filledFields / allFields.length

    return { event, score }
  })

  // Sort by score (descending) and take top N
  scoredEvents.sort((a, b) => b.score - a.score)

  return scoredEvents.slice(0, limit).map(s => s.event)
}
