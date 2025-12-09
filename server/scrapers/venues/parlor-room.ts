import { SquarespaceScraper } from '../platforms/squarespace'
import type { ScraperConfig, ScrapedEvent } from '../types'
import { decodeHtmlEntities } from '../../utils/html'

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
 * The Parlor Room uses Squarespace with LD+JSON event data embedded in the listing page.
 * Events include descriptions directly in the LD+JSON, so we extract from there.
 * Same organization as Iron Horse.
 */
export class ParlorRoomScraper extends SquarespaceScraper {
  constructor() {
    super(parlorRoomConfig)
  }

  protected override async waitForContent(): Promise<void> {
    if (!this.page) return

    // Wait for LD+JSON scripts to load
    try {
      await this.page.waitForSelector('script[type="application/ld+json"]', {
        timeout: 10000,
      })
    } catch {
      await this.page.waitForTimeout(3000)
    }
  }

  // Extract events from LD+JSON on the listing page
  protected override async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const $ = this.$(html)
    const events: ScrapedEvent[] = []

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

    console.log(`[${this.config.name}] Found ${events.length} events from LD+JSON`)
    return events
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

      // Get description - clean up HTML entities
      let description = data.description as string | undefined
      if (description) {
        description = decodeHtmlEntities(description).trim()
        // Skip empty or very short descriptions
        if (description.length < 10) {
          description = undefined
        }
      }

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = decodeHtmlEntities(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      const sourceEventId = `parlor-room-${dateStr}-${titleSlug}`

      return {
        title: decodeHtmlEntities(title),
        description,
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
}
