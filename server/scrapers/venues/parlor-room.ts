import { SquarespaceScraper } from '../platforms/squarespace'
import type { ScraperConfig } from '../types'

export const parlorRoomConfig: ScraperConfig = {
  id: 'parlor-room',
  name: 'The Parlor Room',
  venueSlug: 'the-parlor-room',
  url: 'https://www.parlorroom.org/parlorroomshows',
  enabled: true,
  schedule: '0 6 * * *', // 6 AM daily
  category: 'VENUE' as const,
  priority: 10,
  timezone: 'America/New_York', // Northampton, MA
  defaultAgeRestriction: 'ALL_AGES', // Intimate listening room
}

/**
 * Scraper for The Parlor Room in Northampton, MA
 *
 * The Parlor Room uses Squarespace with standard event pages.
 * Same organization as Iron Horse, uses similar structure.
 * Each event page has LD+JSON with event details.
 */
export class ParlorRoomScraper extends SquarespaceScraper {
  constructor() {
    super(parlorRoomConfig)
  }

  protected async waitForContent(): Promise<void> {
    if (!this.page) return

    // Wait for LD+JSON scripts to load (Parlor Room has events in LD+JSON)
    try {
      await this.page.waitForSelector('script[type="application/ld+json"]', {
        timeout: 10000,
      })
    } catch {
      // If specific selectors don't appear, wait for general content
      await this.page.waitForTimeout(3000)
    }
  }

  // Override parseEvents to extract from LD+JSON first (Parlor Room has all events in LD+JSON)
  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const $ = this.$(html)
    const events: ScrapedEvent[] = []

    // First, extract all events from LD+JSON (Parlor Room has them all here)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '')
        const items = Array.isArray(data) ? data : data['@graph'] || [data]

        for (const item of items) {
          if (item['@type'] === 'Event' || item['@type'] === 'MusicEvent') {
            const event = this.parseLdJsonEvent(item)
            if (event) {
              events.push(event)
            }
          }
        }
      } catch {
        // JSON parse failed, continue
      }
    })

    // If we found events in LD+JSON, return them
    if (events.length > 0) {
      console.log(`[${this.config.name}] Found ${events.length} events from LD+JSON`)
      return events
    }

    // Fallback to parent class method (visit individual event pages)
    return super.parseEvents(html)
  }

  private parseLdJsonEvent(data: Record<string, unknown>): ScrapedEvent | null {
    try {
      const title = data.name as string
      if (!title) return null

      const startDate = data.startDate as string
      if (!startDate) return null

      const startsAt = new Date(startDate)
      if (isNaN(startsAt.getTime())) return null

      // Skip past events
      if (startsAt < new Date()) return null

      const endDate = data.endDate as string
      const endsAt = endDate ? new Date(endDate) : undefined

      // Get image
      let imageUrl: string | undefined
      const image = data.image
      if (Array.isArray(image) && image.length > 0) {
        imageUrl = typeof image[0] === 'string' ? image[0] : (image[0] as Record<string, string>)?.url
      } else if (typeof image === 'string') {
        imageUrl = image
      }

      // Get price
      let coverCharge: string | undefined
      const offers = data.offers as Record<string, unknown> | Record<string, unknown>[]
      if (offers) {
        const offer = Array.isArray(offers) ? offers[0] : offers
        if (offer?.price) {
          coverCharge = typeof offer.price === 'string' ? offer.price : `$${offer.price}`
        }
      }

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      const sourceEventId = `parlor-room-${dateStr}-${titleSlug}`

      return {
        title: title.replace(/&amp;/g, '&').replace(/&apos;/g, "'"),
        description: data.description as string | undefined,
        imageUrl,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl: (data.url as string) || this.config.url,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing LD+JSON event:`, error)
      return null
    }
  }

  // Override event link selector for Parlor Room's URL structure
  // Try multiple patterns since Squarespace can vary
  protected eventLinkSelector = 'a[href*="/parlorroomshows/"], a[href*="/shows-events/"], a[href*="/upcoming-shows/"], a[href*="/events/"]'

  // Override path pattern to match their URL structure
  protected eventPathPattern = /\/(parlorroomshows|shows-events|upcoming-shows|events)\/[a-z0-9-]+$/
}
