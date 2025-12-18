/**
 * AI Agent Service Types
 * For automated scraper generation
 */

import type { LLMProvider } from '../llm/types'

export interface VenueInfo {
  name?: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  website?: string
  phone?: string
  description?: string
  venueType?: 'BAR' | 'CLUB' | 'THEATER' | 'CONCERT_HALL' | 'OUTDOOR' | 'CAFE' | 'RESTAURANT' | 'HOUSE_SHOW' | 'OTHER'
  capacity?: number
  logoUrl?: string
  imageUrl?: string
}

export interface AgentThinkingStep {
  type: 'analysis' | 'planning' | 'code_generation' | 'execution' | 'evaluation' | 'improvement' | 'success' | 'failure'
  message: string
  timestamp: Date
  data?: Record<string, unknown>
}

export interface ScraperGenerationOptions {
  url: string
  llmProvider: LLMProvider
  llmModel: string
  maxIterations?: number
  sessionType: 'VENUE_INFO' | 'EVENT_SCRAPER'
  venueInfo?: VenueInfo // Provided when generating event scraper
  userFeedback?: string // User feedback for retry attempts
  previousCode?: string // Existing scraper code to improve upon
  onThinking?: (step: AgentThinkingStep) => void
  onProgress?: (attempt: number, total: number) => void
  sourceId?: string // Optional source ID to associate with session
  venueId?: string // Optional venue ID to associate with session
}

export interface FieldEvaluationResult {
  fieldsFound: string[]
  fieldsMissing: string[]
  requiredFieldsMissing: string[]
  completenessScore: number // 0-1
  isAcceptable: boolean
  feedback: string
}

export interface ScraperGenerationResult {
  success: boolean
  sessionId: string
  generatedCode?: string
  venueData?: VenueInfo
  eventData?: Record<string, unknown>[]
  completenessScore?: number
  thinking: AgentThinkingStep[]
  errorMessage?: string
}

// Required and optional fields for different scraper types
export const VENUE_REQUIRED_FIELDS = ['name', 'website', 'address', 'city', 'state']
export const VENUE_OPTIONAL_FIELDS = ['postalCode', 'phone', 'description', 'venueType', 'logoUrl', 'imageUrl', 'capacity']

export const EVENT_REQUIRED_FIELDS = ['title', 'startsAt', 'sourceUrl']
export const EVENT_OPTIONAL_FIELDS = [
  'description',
  'imageUrl',
  'doorsAt',
  'endsAt',
  'coverCharge',
  'ageRestriction',
  'ticketUrl',
  'genres',
  'artists',
]
