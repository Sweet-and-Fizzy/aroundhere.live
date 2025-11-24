import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'

/**
 * Scraper for New City Brewery - Squarespace site with JSON API
 *
 * This scraper uses Squarespace's built-in JSON API endpoint (?format=json)
 * which returns structured event data without needing to parse HTML.
 */

export const newCityBreweryConfig: ScraperConfig = {
  id: 'new-city-brewery',
  name: 'New City Brewery',
  venueSlug: 'new-city-brewery',
  url: 'https://newcitybrewery.com/events-1',
  enabled: true,
  schedule: '0 6 * * *',
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'ALL_AGES', // Family-friendly brewery
}

interface SquarespaceEvent {
  id: string
  title: string
  startDate: number // Unix timestamp in milliseconds
  endDate: number
  body?: string // HTML description
  excerpt?: string // Plain text excerpt
  fullUrl: string // Path like /events-1/event-slug
  assetUrl?: string // Image URL
  urlId: string // URL slug
}

interface SquarespaceResponse {
  upcoming?: SquarespaceEvent[]
  pagination?: {
    nextPage: boolean
    nextPageOffset?: number
    nextPageUrl?: string
  }
}

export class NewCityBreweryScraper extends HttpScraper {
  constructor() {
    super(newCityBreweryConfig)
  }

  async scrape() {
    const startTime = Date.now()
    const errors: string[] = []
    const allEvents: ScrapedEvent[] = []

    try {
      console.log(`[${this.config.name}] Fetching events from JSON API...`)

      // Fetch first page
      let url = `${this.config.url}?format=json`
      let hasMore = true

      while (hasMore) {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = (await response.json()) as SquarespaceResponse

        if (data.upcoming) {
          const events = data.upcoming.map((e) => this.parseSquarespaceEvent(e))
          allEvents.push(...events.filter((e): e is ScrapedEvent => e !== null))
        }

        // Handle pagination
        if (data.pagination?.nextPage && data.pagination.nextPageUrl) {
          url = `https://newcitybrewery.com${data.pagination.nextPageUrl}&format=json`
          // Rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500))
        } else {
          hasMore = false
        }
      }

      console.log(`[${this.config.name}] Found ${allEvents.length} events`)

      return {
        success: true,
        events: allEvents,
        errors,
        scrapedAt: new Date(),
        duration: Date.now() - startTime,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push(message)
      console.error(`[${this.config.name}] Scrape failed:`, message)

      return {
        success: false,
        events: allEvents,
        errors,
        scrapedAt: new Date(),
        duration: Date.now() - startTime,
      }
    }
  }

  private parseSquarespaceEvent(data: SquarespaceEvent): ScrapedEvent | null {
    try {
      // Convert millisecond timestamps to Date
      const startsAt = new Date(data.startDate)
      const endsAt = data.endDate ? new Date(data.endDate) : undefined

      if (isNaN(startsAt.getTime())) {
        console.warn(`[${this.config.name}] Invalid date for event: ${data.title}`)
        return null
      }

      // Skip past events
      if (startsAt < new Date()) {
        return null
      }

      // Clean up description - strip HTML for plain text
      let description = data.excerpt
      if (!description && data.body) {
        description = this.stripHtml(data.body)
      } else if (description) {
        // Excerpt might also contain HTML
        description = this.stripHtml(description)
      }

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const sourceEventId = `${this.config.id}-${dateStr}-${data.urlId}`

      const sourceUrl = `https://newcitybrewery.com${data.fullUrl}`

      return {
        title: data.title,
        description,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl,
        sourceEventId,
        imageUrl: data.assetUrl,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing event:`, error)
      return null
    }
  }

  /**
   * Strip HTML tags and clean up text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')   // Remove HTML tags
      .replace(/&nbsp;/g, ' ')    // Replace &nbsp;
      .replace(/&amp;/g, '&')     // Decode HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')       // Collapse whitespace
      .trim()
      .slice(0, 500)              // Limit length
  }

  // HttpScraper requires parseEvents but we override scrape() directly
  protected async parseEvents(_html: string): Promise<ScrapedEvent[]> {
    return []
  }
}
