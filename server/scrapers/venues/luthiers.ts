import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig, ScraperResult } from '../types'
import * as cheerio from 'cheerio'
import { fromZonedTime } from 'date-fns-tz'
import { decodeHtmlEntities } from '../../utils/html'

/**
 * Scraper for Luthier's Co-op in Easthampton, MA
 *
 * The site uses The Events Calendar (Tribe Events) WordPress plugin.
 * We use the Tribe Events REST API for reliable event fetching.
 */

export const luthiersConfig: ScraperConfig = {
  id: 'luthiers',
  name: "Luthier's Co-op",
  venueSlug: 'luthiers-coop',
  url: 'https://www.luthiers-coop.com/events/',
  enabled: true,
  schedule: '0 6 * * *', // 6 AM daily
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'ALL_AGES', // All ages welcome per website
}

// Tribe Events API response types
interface TribeEvent {
  id: number
  title: string
  description?: string
  excerpt?: string
  start_date: string
  end_date?: string
  url: string
  image?: {
    url?: string
    sizes?: {
      medium?: { url?: string }
      large?: { url?: string }
    }
  }
  cost?: string
  cost_details?: {
    values?: string[]
  }
}

interface TribeEventsResponse {
  events: TribeEvent[]
  total: number
  total_pages: number
}

export class LuthiersScraper extends HttpScraper {
  constructor() {
    super(luthiersConfig)
  }

  /**
   * Use Tribe Events REST API for reliable event fetching.
   * The API handles pagination and returns all future events.
   */
  async scrape(): Promise<ScraperResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const allEvents: ScrapedEvent[] = []
    const seenIds = new Set<string>()

    try {
      // Use Tribe Events REST API - it's more reliable than HTML scraping
      const today = new Date().toISOString().split('T')[0]
      const apiUrl = `https://www.luthiers-coop.com/wp-json/tribe/events/v1/events?start_date=${today}&per_page=100`

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`)
      }

      const data = (await response.json()) as TribeEventsResponse

      for (const item of data.events || []) {
        const event = this.parseTribeEvent(item)
        if (event && event.sourceEventId && !seenIds.has(event.sourceEventId)) {
          seenIds.add(event.sourceEventId)
          allEvents.push(event)
        }
      }

      console.log(`[${this.config.name}] Found ${allEvents.length} events from API (total available: ${data.total})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push(message)
      console.error(`[${this.config.name}] API error:`, message)

      // Fall back to HTML scraping if API fails
      console.log(`[${this.config.name}] Falling back to HTML scraping`)
      try {
        const response = await fetch(this.config.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        })

        if (response.ok) {
          const html = await response.text()
          const events = await this.parseEvents(html)
          for (const event of events) {
            if (event.sourceEventId && !seenIds.has(event.sourceEventId)) {
              seenIds.add(event.sourceEventId)
              allEvents.push(event)
            }
          }
        }
      } catch (fallbackError) {
        console.error(`[${this.config.name}] Fallback error:`, fallbackError)
      }
    }

    return {
      success: errors.length === 0 || allEvents.length > 0,
      events: allEvents,
      errors,
      scrapedAt: new Date(),
      duration: Date.now() - startTime,
    }
  }

  /**
   * Parse a Tribe Events API response item
   */
  private parseTribeEvent(data: TribeEvent): ScrapedEvent | null {
    try {
      const rawName = decodeHtmlEntities(data.title || '')
      if (!rawName) return null

      // Skip non-event entries
      const skipPatterns = [
        /^closed$/i,
        /^backstage bar open/i,
        /^bar open/i,
        /^kitchen open/i,
      ]
      if (skipPatterns.some((pattern) => pattern.test(rawName.trim()))) {
        return null
      }

      // Clean up the title - remove time suffixes
      const name = this.cleanTitle(rawName)

      // Parse start date
      const startsAt = new Date(data.start_date)
      if (isNaN(startsAt.getTime())) return null

      // Skip past events
      if (startsAt < new Date()) return null

      // Parse end date if available
      const endsAt = data.end_date ? new Date(data.end_date) : undefined

      // Get description
      let description = data.description || data.excerpt
      if (description) {
        description = description
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&#8217;/g, "'")
          .replace(/&#8211;/g, '-')
          .replace(/&#038;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        if (description.length < 10) {
          description = undefined
        }
      }

      // Get image URL
      const imageUrl =
        data.image?.sizes?.large?.url || data.image?.sizes?.medium?.url || data.image?.url

      // Get price
      let coverCharge: string | undefined
      if (data.cost) {
        coverCharge = data.cost
      } else if (data.cost_details?.values?.length) {
        coverCharge = data.cost_details.values[0]
      }

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50)
      const sourceEventId = `luthiers-${dateStr}-${titleSlug}`

      return {
        title: name,
        description,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl: data.url || this.config.url,
        sourceEventId,
        imageUrl,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing Tribe event:`, error)
      return null
    }
  }

  /**
   * Fallback: Parse events from HTML/JSON-LD (used if API fails)
   */
  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const $ = cheerio.load(html)
    const events: ScrapedEvent[] = []
    const seenIds = new Set<string>()

    // Parse JSON-LD structured data from script tags
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const jsonText = $(el).html()
        if (!jsonText) return

        const data = JSON.parse(jsonText)

        // Handle both single events and arrays
        const items = Array.isArray(data) ? data : [data]

        for (const item of items) {
          // Check if this is an Event schema type
          if (item['@type'] !== 'Event') continue

          const event = this.parseLdJsonEvent(item)
          if (event && !seenIds.has(event.sourceEventId || '')) {
            seenIds.add(event.sourceEventId || '')
            events.push(event)
          }
        }
      } catch {
        // JSON parse error, continue to next script
      }
    })

    // If no JSON-LD found, fall back to parsing HTML event links
    if (events.length === 0) {
      console.log(`[${this.config.name}] No JSON-LD events found, trying HTML parsing`)
      return this.parseHtmlEvents($)
    }

    console.log(`[${this.config.name}] Found ${events.length} events from JSON-LD`)
    return events
  }

  private parseLdJsonEvent(data: Record<string, unknown>): ScrapedEvent | null {
    try {
      const rawName = data.name as string
      if (!rawName) return null

      // Skip non-event entries
      const skipPatterns = [
        /^closed$/i,
        /^backstage bar open/i,
        /^bar open/i,
        /^kitchen open/i,
      ]
      if (skipPatterns.some(pattern => pattern.test(rawName.trim()))) {
        return null
      }

      // Clean up the title - remove time suffixes
      const name = this.cleanTitle(rawName)

      // Parse start date
      const startDate = data.startDate as string
      if (!startDate) return null

      const startsAt = new Date(startDate)
      if (isNaN(startsAt.getTime())) return null

      // Skip past events
      if (startsAt < new Date()) return null

      // Parse end date if available
      const endDate = data.endDate as string
      const endsAt = endDate ? new Date(endDate) : undefined

      // Get description
      let description = data.description as string | undefined
      if (description) {
        // Strip HTML tags and clean up entities
        description = description
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        // Skip very short descriptions
        if (description.length < 10) {
          description = undefined
        }
      }

      // Get image URL
      let imageUrl: string | undefined
      const image = data.image as string | string[] | { url: string } | undefined
      if (image) {
        if (typeof image === 'string') {
          imageUrl = image
        } else if (Array.isArray(image) && image.length > 0) {
          imageUrl = typeof image[0] === 'string' ? image[0] : (image[0] as { url: string })?.url
        } else if (typeof image === 'object' && 'url' in image) {
          imageUrl = image.url
        }
      }

      // Get event URL
      const eventUrl = (data.url as string) || this.config.url

      // Get price/offers if available
      let coverCharge: string | undefined
      const offers = data.offers as Record<string, unknown> | Record<string, unknown>[] | undefined
      if (offers) {
        const offer = Array.isArray(offers) ? offers[0] : offers
        if (offer) {
          const price = offer.price as number | string | undefined
          if (price !== undefined) {
            coverCharge = typeof price === 'number' ? (price === 0 ? 'Free' : `$${price}`) : price
          }
        }
      }

      // Generate stable event ID from date and title slug
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50)
      const sourceEventId = `luthiers-${dateStr}-${titleSlug}`

      return {
        title: name,
        description,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl: eventUrl,
        sourceEventId,
        imageUrl,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing JSON-LD event:`, error)
      return null
    }
  }

  /**
   * Clean up event titles by removing embedded times
   * Examples:
   *   "Open Mic 7-10 (Sign-Up @ 6)" -> "Open Mic"
   *   "Pamela Means 3rd Thursday Residency, 7-8:30" -> "Pamela Means 3rd Thursday Residency"
   *   "Karaoke, 8:30-11pm" -> "Karaoke"
   *   "Rodrigo Alonzo, 7-8" -> "Rodrigo Alonzo"
   */
  private cleanTitle(title: string): string {
    return title
      // Remove time ranges like "7-10", "7-8:30", "8:30-11pm", "7pm-10pm"
      .replace(/,?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*-\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
      // Remove standalone times like "7pm", "8:30pm"
      .replace(/,?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, '')
      // Remove parenthetical notes about times like "(Sign-Up @ 6)"
      .replace(/\s*\([^)]*(?:sign[- ]?up|@|\d{1,2}(?::\d{2})?(?:am|pm)?)[^)]*\)/gi, '')
      // Clean up trailing punctuation and whitespace
      .replace(/[,\s]+$/, '')
      .trim()
  }

  /**
   * Fallback HTML parsing for when JSON-LD is not available
   * Parses event links from the Tribe Events calendar
   */
  private parseHtmlEvents($: cheerio.CheerioAPI): ScrapedEvent[] {
    const events: ScrapedEvent[] = []
    const seenUrls = new Set<string>()

    // Look for event links in various Tribe Events selectors
    const eventSelectors = [
      '.tribe-events-calendar-list__event-title a',
      '.tribe-events-list-event-title a',
      '.tribe-mini-calendar-event a',
      'a[href*="/event/"]',
    ]

    for (const selector of eventSelectors) {
      $(selector).each((_, el) => {
        const $link = $(el)
        const href = $link.attr('href')
        const title = $link.text().trim()

        if (!href || !title || seenUrls.has(href)) return
        seenUrls.add(href)

        // Try to extract date from URL (format: /event/slug/YYYY-MM-DD/)
        const dateMatch = href.match(/\/(\d{4}-\d{2}-\d{2})\/?$/)
        if (!dateMatch) return

        const dateStr = dateMatch[1]
        // Default to 7 PM since that's when live music starts
        const startsAt = fromZonedTime(
          new Date(`${dateStr}T19:00:00`),
          this.config.timezone
        )

        // Skip past events
        if (startsAt < new Date()) return

        const sourceEventId = `luthiers-${dateStr}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`

        events.push({
          title,
          startsAt,
          sourceUrl: href.startsWith('http') ? href : `https://www.luthiers-coop.com${href}`,
          sourceEventId,
        })
      })
    }

    console.log(`[${this.config.name}] Found ${events.length} events from HTML`)
    return events
  }
}
