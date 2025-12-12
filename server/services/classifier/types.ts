// Event classification types

export const CANONICAL_GENRES = [
  'rock',
  'indie',
  'punk',
  'metal',
  'jazz',
  'blues',
  'folk',
  'country',
  'bluegrass',
  'americana',
  'singer-songwriter',
  'hip-hop',
  'r-and-b',
  'electronic',
  'classical',
  'world',
  'funk',
  'reggae',
] as const

export type CanonicalGenre = (typeof CANONICAL_GENRES)[number]

export const EVENT_TYPES = [
  'MUSIC',
  'DJ',
  'OPEN_MIC',
  'COMEDY',
  'THEATER',
  'GAMES',
  'KARAOKE',
  'PRIVATE',
  'FILM',
  'SPOKEN_WORD',
  'DANCE',
  'MARKET',
  'WORKSHOP',
  'PARTY',
  'FITNESS',
  'DRAG',
  'OTHER',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export interface ClassificationResult {
  eventId: string
  isMusic: boolean
  eventType: EventType
  canonicalGenres: CanonicalGenre[]
  confidence: number // 0-1
  reasoning?: string
  summary?: string // Concise 1-2 sentence summary of the event
}

export interface ClassificationInput {
  id: string
  title: string
  description?: string | null
  venueName?: string
  existingTags?: string[]
}

export interface BatchClassificationResult {
  processed: number
  musicEvents: number
  nonMusicEvents: number
  errors: string[]
  results: ClassificationResult[]
}
