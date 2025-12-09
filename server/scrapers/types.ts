// Scraper types and interfaces

export interface ScrapedEvent {
  title: string
  description?: string // Can be plain text or HTML - processDescriptions() handles both
  startsAt: Date
  endsAt?: Date
  doorsAt?: Date
  coverCharge?: string
  ageRestriction?: 'ALL_AGES' | 'EIGHTEEN_PLUS' | 'TWENTY_ONE_PLUS'
  ticketUrl?: string
  sourceUrl: string
  sourceEventId?: string
  artists?: ScrapedArtist[]
  imageUrl?: string
  genres?: string[] // Genre/category tags from the source
}

export interface ScrapedArtist {
  name: string
  genres?: string[]
  isHeadliner?: boolean
}

export type SourceCategory = 'VENUE' | 'TICKETING' | 'PROMOTER' | 'ARTIST' | 'AGGREGATOR' | 'SOCIAL' | 'OTHER'

export interface ScraperConfig {
  id: string
  name: string
  venueSlug: string
  url: string
  enabled: boolean
  schedule?: string // cron expression
  category: SourceCategory // For dedup priority
  priority: number // Lower = higher priority (venue=10, ticketing=20, artist=30)
  timezone: string // IANA timezone (e.g., 'America/New_York')
  defaultAgeRestriction?: 'ALL_AGES' | 'EIGHTEEN_PLUS' | 'TWENTY_ONE_PLUS' // Venue default
}

export interface ScraperResult {
  success: boolean
  events: ScrapedEvent[]
  errors: string[]
  scrapedAt: Date
  duration: number
}

export interface BaseScraper {
  config: ScraperConfig
  scrape(): Promise<ScraperResult>
}
