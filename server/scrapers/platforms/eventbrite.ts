import { PlaywrightScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'

export interface EventbriteScraperConfig extends ScraperConfig {
  organizerId: string
}

/**
 * Base scraper for Eventbrite organizer pages.
 *
 * Eventbrite embeds event data as JSON in window.__SERVER_DATA__,
 * which we extract and parse rather than scraping the DOM.
 */
export abstract class EventbriteScraper extends PlaywrightScraper {
  protected organizerId: string

  constructor(config: EventbriteScraperConfig) {
    super({
      ...config,
      url: `https://www.eventbrite.com/o/${config.organizerId}`,
    })
    this.organizerId = config.organizerId
  }

  protected async parseEvents(_html: string): Promise<ScrapedEvent[]> {
    if (!this.page) return []

    // Extract the __SERVER_DATA__ JSON from the page
    const serverData = await this.page.evaluate(() => {
      // @ts-expect-error - Eventbrite injects this global
      return window.__SERVER_DATA__
    })

    if (!serverData) {
      console.log(`[${this.config.name}] No __SERVER_DATA__ found`)
      return []
    }

    // Navigate the data structure to find events
    // Structure: serverData.components[].events[] or similar
    const events = this.extractEventsFromServerData(serverData)

    console.log(`[${this.config.name}] Found ${events.length} events in __SERVER_DATA__`)

    // For each event, we may need to fetch the detail page to get age restriction
    const scrapedEvents: ScrapedEvent[] = []

    for (const event of events) {
      try {
        const scrapedEvent = await this.parseEventData(event)
        if (scrapedEvent) {
          scrapedEvents.push(scrapedEvent)
        }
      } catch (error) {
        console.error(`[${this.config.name}] Error parsing event:`, error)
      }
    }

    return scrapedEvents
  }

  /**
   * Extract events array from Eventbrite's __SERVER_DATA__ structure
   */
  protected extractEventsFromServerData(serverData: Record<string, unknown>): Record<string, unknown>[] {
    const events: Record<string, unknown>[] = []

    // Try to find events in the data structure
    // Eventbrite's structure can vary, so we search for it
    const findEvents = (obj: unknown, depth = 0): void => {
      if (depth > 10 || !obj || typeof obj !== 'object') return

      if (Array.isArray(obj)) {
        for (const item of obj) {
          // Check if this looks like an event object
          if (item && typeof item === 'object' && 'id' in item && 'name' in item && 'start' in item) {
            events.push(item as Record<string, unknown>)
          } else {
            findEvents(item, depth + 1)
          }
        }
      } else {
        for (const value of Object.values(obj)) {
          findEvents(value, depth + 1)
        }
      }
    }

    findEvents(serverData)
    return events
  }

  /**
   * Parse a single event from Eventbrite's data structure
   */
  protected async parseEventData(eventData: Record<string, unknown>): Promise<ScrapedEvent | null> {
    try {
      // Extract name
      const nameObj = eventData.name as { text?: string } | undefined
      const title = nameObj?.text
      if (!title) return null

      // Extract URL
      const eventUrl = eventData.url as string | undefined
      if (!eventUrl) return null

      // Extract event ID
      const eventId = eventData.id as string | undefined

      // Extract start time
      const startObj = eventData.start as { utc?: string; local?: string } | undefined
      if (!startObj?.utc) return null
      const startsAt = new Date(startObj.utc)
      if (isNaN(startsAt.getTime())) return null

      // Skip past events
      if (startsAt < new Date()) {
        return null
      }

      // Extract end time
      const endObj = eventData.end as { utc?: string } | undefined
      const endsAt = endObj?.utc ? new Date(endObj.utc) : undefined

      // Extract price - handle "Free" or price range like "$17.85"
      const isFree = eventData.is_free as boolean | undefined
      const priceRange = eventData.price_range as string | undefined
      const coverCharge = isFree ? 'Free' : priceRange || undefined

      // Extract image
      const logoObj = eventData.logo as { url?: string } | undefined
      const imageUrl = logoObj?.url

      // Extract description/summary - it's a string directly, not an object
      const description = eventData.summary as string | undefined

      // Fetch event detail page to get age restriction (only for future events)
      const ageRestriction = await this.fetchAgeRestriction(eventUrl)

      return {
        title,
        description,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl: eventUrl,
        sourceEventId: eventId ? `eventbrite-${eventId}` : undefined,
        coverCharge,
        imageUrl,
        ticketUrl: eventUrl,
        ageRestriction,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing event data:`, error)
      return null
    }
  }

  /**
   * Fetch event detail page to extract age restriction
   */
  protected async fetchAgeRestriction(eventUrl: string): Promise<'ALL_AGES' | 'EIGHTEEN_PLUS' | 'TWENTY_ONE_PLUS' | undefined> {
    if (!this.page) return undefined

    try {
      // Navigate to event page
      await this.page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

      // Look for age restriction in page content
      const pageText = await this.page.evaluate(() => document.body.innerText)

      // Check for common age restriction patterns
      if (/\b21\+|\btwenty[- ]?one\s*\+|21\s*and\s*over|ages?\s*21/i.test(pageText)) {
        return 'TWENTY_ONE_PLUS'
      }
      if (/\b18\+|\beighteen\s*\+|18\s*and\s*over|ages?\s*18/i.test(pageText)) {
        return 'EIGHTEEN_PLUS'
      }
      if (/\ball\s*ages/i.test(pageText)) {
        return 'ALL_AGES'
      }

      return undefined
    } catch (error) {
      console.error(`[${this.config.name}] Error fetching age restriction from ${eventUrl}:`, error)
      return undefined
    }
  }

  protected override async waitForContent(): Promise<void> {
    if (!this.page) return

    try {
      // Wait for the page to have __SERVER_DATA__
      await this.page.waitForFunction(
        () => typeof (window as unknown as { __SERVER_DATA__: unknown }).__SERVER_DATA__ !== 'undefined',
        { timeout: 15000 }
      )
    } catch {
      // Fallback wait
      await this.page.waitForTimeout(5000)
    }
  }

  // Override to use domcontentloaded since we're reading JS data, not waiting for full render
  protected override getWaitUntilStrategy(): 'networkidle' | 'domcontentloaded' | 'load' | 'commit' {
    return 'domcontentloaded'
  }
}
