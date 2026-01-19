import { PlaywrightScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'
import { decodeHtmlEntities } from '../../utils/html'

// Type for deeply nested API responses where structure is not fully known
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = Record<string, any>

export const parlorRoomConfig: ScraperConfig = {
  id: 'parlor-room',
  name: 'The Parlor Room',
  venueSlug: 'the-parlor-room',
  url: 'https://ironhorse.org/parlorroomshows/',
  enabled: true,
  schedule: '0 6,14 * * *', // 6 AM and 2 PM daily
  category: 'VENUE' as const,
  priority: 10,
  timezone: 'America/New_York', // Northampton, MA
  defaultAgeRestriction: 'ALL_AGES', // Intimate listening room
}

// Parlor Room calendar widget ID (Elfsight) - different from Iron Horse
const PARLOR_ROOM_WIDGET_ID = '0d9e6fc9-dd99-4aee-9ff2-b83f03b2f3ef'

// Type for Elfsight event data from API
interface ElfsightEvent {
  id: string
  name: string
  start?: { date?: string; time?: string }
  end?: { date?: string; time?: string }
  description?: string
  image?: string
  buttonLink?: { value?: string }
}

/**
 * Scraper for The Parlor Room in Northampton, MA
 *
 * The Parlor Room is now hosted on ironhorse.org and uses the same Elfsight
 * calendar widget as Iron Horse, but with a different widget ID.
 * Same organization as Iron Horse.
 */
export class ParlorRoomScraper extends PlaywrightScraper {
  // Map of "name|date" (lowercase) to Elfsight event data for matching
  private elfsightEvents: Map<string, ElfsightEvent> = new Map()

  constructor() {
    super(parlorRoomConfig)
  }

  // Parlor Room uses click-based pagination with "Next Events" button
  protected override supportsPagination(): boolean {
    return true
  }

  protected override getMaxPages(): number {
    return 10 // Up to 10 pages of events
  }

  protected override async loadNextPage(): Promise<boolean> {
    if (!this.page) return false

    try {
      // Dismiss popup before clicking (it can reappear between pages)
      await this.dismissPopup()

      const nextButton = await this.page.$('button:has-text("Next Events")')
      if (!nextButton) return false

      const isDisabled = await nextButton.evaluate(el => (el as HTMLButtonElement).disabled)
      if (isDisabled) return false

      await nextButton.click({ timeout: 5000 })
      await this.page.waitForTimeout(2000)
      return true
    } catch {
      return false
    }
  }

  // Set up response listener BEFORE navigation to capture Elfsight API
  protected override async beforeNavigate(): Promise<void> {
    if (!this.page) return

    // Set up listener for Elfsight API response to capture event IDs
    this.page.on('response', async (response) => {
      const url = response.url()
      if (url.includes('core.service.elfsight.com') && url.includes('boot')) {
        try {
          const data = await response.json()
          this.extractElfsightEventIds(data)
        } catch {
          // Ignore JSON parse errors
        }
      }
    })
  }

  // Use domcontentloaded - networkidle can timeout before Elfsight initializes
  protected override getWaitUntilStrategy(): 'networkidle' | 'domcontentloaded' | 'load' | 'commit' {
    return 'domcontentloaded'
  }

  protected override async waitForContent(): Promise<void> {
    if (!this.page) return

    // Wait for the calendar widget to render (they use a third-party widget)
    // The Elfsight widget takes time to render into the DOM
    try {
      // Elfsight uses list layout - wait for list items to render
      await this.page.waitForSelector('.eapp-events-calendar-list-item-component', {
        timeout: 20000,
      })
      // Give it extra time to ensure all events are rendered
      await this.page.waitForTimeout(3000)
    } catch {
      // If specific selectors don't appear, wait longer for Elfsight to initialize
      await this.page.waitForTimeout(10000)
    }

    // Dismiss promotional popup that blocks pagination clicks
    await this.dismissPopup()
  }

  // Dismiss the Squarespace promotional popup overlay
  private async dismissPopup(): Promise<void> {
    if (!this.page) return

    try {
      // Look for common popup close buttons/overlays
      const closeSelectors = [
        '.sqs-popup-overlay-close',
        '.yui-popup-container-node .sqs-modal-lightbox-close',
        '[data-test="popup-close"]',
        '.sqs-slide-container [aria-label="Close"]',
        '.newsletter-form-close',
      ]

      for (const selector of closeSelectors) {
        const closeButton = await this.page.$(selector)
        if (closeButton) {
          await closeButton.click({ force: true })
          console.log(`[Parlor Room] Dismissed popup via ${selector}`)
          await this.page.waitForTimeout(500)
          return
        }
      }

      // If no close button, try clicking outside the popup or pressing Escape
      const popup = await this.page.$('.yui-popup-container-node')
      if (popup) {
        await this.page.keyboard.press('Escape')
        console.log('[Parlor Room] Dismissed popup via Escape key')
        await this.page.waitForTimeout(500)
      }
    } catch {
      // Ignore errors - popup may not be present
    }
  }

  // Extract event data from Elfsight API response
  private extractElfsightEventIds(apiResponse: ApiResponse): void {
    try {
      const widgetData = apiResponse?.data?.widgets?.[PARLOR_ROOM_WIDGET_ID]?.data?.settings?.events
      if (Array.isArray(widgetData)) {
        for (const event of widgetData) {
          if (event.id && event.name) {
            // Normalize name and include date for unique matching
            const normalizedName = decodeHtmlEntities(event.name).toLowerCase().trim()
            const eventDate = event.start?.date || ''
            const key = `${normalizedName}|${eventDate}`
            this.elfsightEvents.set(key, event as ElfsightEvent)
          }
        }
        console.log(`[Parlor Room] Captured ${this.elfsightEvents.size} event IDs from Elfsight API`)
      }
    } catch (error) {
      console.error('[Parlor Room] Error extracting Elfsight event IDs:', error)
    }
  }

  // Get the Elfsight event data for a given title and date
  private getElfsightEvent(title: string, date?: Date): ElfsightEvent | undefined {
    const normalizedTitle = title.toLowerCase().trim()

    // Try matching with date first (most accurate)
    if (date) {
      const dateStr = date.toISOString().split('T')[0]
      const keyWithDate = `${normalizedTitle}|${dateStr}`
      const eventWithDate = this.elfsightEvents.get(keyWithDate)
      if (eventWithDate) return eventWithDate
    }

    // Fall back to finding any event with matching name
    for (const [key, event] of Array.from(this.elfsightEvents.entries())) {
      if (key.startsWith(`${normalizedTitle}|`)) {
        return event
      }
    }

    return undefined
  }

  // Build the direct event URL - prefer Salesforce ticket URL, fall back to calendar
  private buildEventUrl(title: string, date?: Date): string {
    const event = this.getElfsightEvent(title, date)

    // Prefer the Salesforce ticket URL from buttonLink.value
    if (event?.buttonLink?.value) {
      return event.buttonLink.value
    }

    // Fallback to base calendar URL for free events without ticket links
    return this.config.url
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const $ = this.$(html)
    const events: ScrapedEvent[] = []

    // First, extract rich event data from LD+JSON script tags (has descriptions)
    const ldJsonData = this.extractLdJsonEvents($)

    // Parlor Room uses Elfsight calendar widget (list layout)
    const eventElements = $('.eapp-events-calendar-list-item-component')

    if (eventElements.length > 0) {
      eventElements.each((_, el) => {
        const event = this.parseEappEventElement($, $(el), ldJsonData)
        if (event) {
          events.push(event)
        }
      })
    }

    // Also try LD+JSON as fallback
    if (events.length === 0) {
      const scriptEvents = this.extractFromScripts(html)
      events.push(...scriptEvents)
    }

    console.log(`[${this.config.name}] Found ${events.length} events`)
    return events
  }

  // Extract event data from page-level LD+JSON script tags
  private extractLdJsonEvents($: ReturnType<typeof this.$>): Map<string, { description?: string; image?: string }> {
    const eventData = new Map<string, { description?: string; image?: string }>()

    $('script[type="application/ld+json"]').each((_, el) => {
      const content = $(el).html()
      if (!content) return

      try {
        const data = JSON.parse(content)
        if (data['@type'] === 'Event') {
          const name = decodeHtmlEntities(data.name || '')
          if (name) {
            eventData.set(name.toLowerCase(), {
              description: data.description ? decodeHtmlEntities(data.description) : undefined,
              image: data.image || undefined,
            })
          }
        }
      } catch {
        // Ignore parse errors
      }
    })

    return eventData
  }

  private parseEappEventElement(
    $: ReturnType<typeof this.$>,
    $el: ReturnType<ReturnType<typeof this.$>>,
    ldJsonData: Map<string, { description?: string; image?: string }>
  ): ScrapedEvent | null {
    try {
      const title = this.cleanText(
        $el.find('.eapp-events-calendar-list-item-name, .eapp-events-calendar-name-component').text()
      )
      if (!title) return null

      // Parse date from the date element (format: "Nov22Sat")
      const dateText = this.cleanText(
        $el.find('.eapp-events-calendar-date-element-component').text()
      )

      // Parse time (format: "7:00 PM" or "7:00 PM - 9:00 PM")
      const timeText = this.cleanText(
        $el.find('.eapp-events-calendar-time-text').text()
      )

      const startsAt = this.parseEappDate(dateText, timeText)
      if (!startsAt) {
        console.log(`[Parlor Room] Could not parse date for: ${title} (date: ${dateText}, time: ${timeText})`)
        return null
      }

      // Look up rich data from LD+JSON (has full descriptions)
      const richData = ldJsonData.get(title.toLowerCase())
      let description = richData?.description
      let imageUrl = richData?.image

      // Fallback: try inline JSON-LD in element
      if (!description || !imageUrl) {
        const elementHtml = $.html($el)
        const jsonLdMatch = elementHtml.match(/\{"@context":"http:\/\/schema\.org\/","@type":"Event"[^}]+\}/)
        if (jsonLdMatch) {
          try {
            const schemaData = JSON.parse(jsonLdMatch[0])
            if (!description && schemaData.description) {
              description = decodeHtmlEntities(schemaData.description)
            }
            if (!imageUrl && schemaData.image) {
              imageUrl = schemaData.image
            }
          } catch {
            // JSON parse failed
          }
        }
      }

      // Fallback: get image from img tag
      if (!imageUrl) {
        imageUrl = $el.find('img').first().attr('src') || undefined
      }

      // Extract genre/category from the category element
      const genres: string[] = []
      const categoryText = this.cleanText(
        $el.find('.eapp-events-calendar-category-item').text()
      )
      if (categoryText) {
        genres.push(categoryText)
      }

      // Extract price from the button caption (e.g., "Tickets starting at $12 (includes all fees)")
      const priceCaption = this.cleanText(
        $el.find('.eapp-events-calendar-button-element-caption').text()
      )
      const coverCharge = this.extractPrice(priceCaption)

      // Use Elfsight's stable event ID when available - this prevents duplicates
      // when titles change (e.g., opener added). Only fall back to title-based ID
      // if Elfsight ID not available.
      const elfsightEvent = this.getElfsightEvent(title, startsAt)
      const sourceEventId = elfsightEvent?.id
        ? `parlor-room-elfsight-${elfsightEvent.id}`
        : this.generateEventId(title, startsAt)
      const sourceUrl = this.buildEventUrl(title, startsAt)

      return {
        title,
        description,
        imageUrl,
        startsAt,
        sourceUrl,
        sourceEventId,
        genres: genres.length > 0 ? genres : undefined,
        coverCharge,
      }
    } catch (error) {
      console.error('[Parlor Room] Error parsing eapp event element:', error)
      return null
    }
  }

  // Extract price from caption text like "Tickets starting at $12 (includes all fees)"
  private extractPrice(caption: string): string | undefined {
    if (!caption) return undefined

    // Match price patterns: "$12", "$21.60", etc.
    const priceMatch = caption.match(/\$(\d+(?:\.\d{2})?)/)
    if (priceMatch) {
      return `$${priceMatch[1]}`
    }

    return undefined
  }

  private parseEappDate(dateText: string, timeText: string): Date | null {
    try {
      // dateText format: "Nov22Sat" or "Dec5Thu"
      const dateMatch = dateText.match(/([A-Za-z]+)(\d+)/)
      if (!dateMatch || !dateMatch[1] || !dateMatch[2]) return null

      const monthStr = dateMatch[1].toLowerCase()
      const day = parseInt(dateMatch[2])

      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      }

      const month = months[monthStr.slice(0, 3)]
      if (month === undefined) return null

      // Determine year - venue calendars typically show upcoming events
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth()

      let year = currentYear

      // If the month is significantly in the past (more than 1 month ago),
      // it's probably next year
      if (month < currentMonth - 1) {
        year = currentYear + 1
      }

      // Validate: if this results in a date more than 14 months out,
      // something is wrong - revert to current year
      const testDate = new Date(year, month, day)
      const monthsAway = (testDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (monthsAway > 14) {
        year = currentYear
      }

      // Parse time (format: "7:00 PM" or "10:00 PM - 11:45 PM")
      let hours = 20 // Default to 8 PM if no time found
      let minutes = 0

      const timeMatch = timeText.match(/(\d+):(\d+)\s*(AM|PM)/i)
      if (timeMatch && timeMatch[1] && timeMatch[2] && timeMatch[3]) {
        hours = parseInt(timeMatch[1])
        minutes = parseInt(timeMatch[2])
        const ampm = timeMatch[3].toLowerCase()

        if (ampm === 'pm' && hours < 12) hours += 12
        if (ampm === 'am' && hours === 12) hours = 0
      }

      // Use the timezone-aware method to create the date in UTC
      return this.createDateInTimezone(year, month, day, hours, minutes)
    } catch {
      return null
    }
  }

  private extractFromScripts(html: string): ScrapedEvent[] {
    const events: ScrapedEvent[] = []

    // Try looking for LD+JSON structured data
    const ldJsonMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    if (ldJsonMatch) {
      for (const script of ldJsonMatch) {
        try {
          const jsonStr = script.replace(/<\/?script[^>]*>/g, '')
          const data = JSON.parse(jsonStr)

          if (data['@type'] === 'Event' || data['@type'] === 'MusicEvent') {
            const event = this.parseLdJsonEvent(data)
            if (event) events.push(event)
          } else if (Array.isArray(data)) {
            for (const item of data) {
              if (item['@type'] === 'Event' || item['@type'] === 'MusicEvent') {
                const event = this.parseLdJsonEvent(item)
                if (event) events.push(event)
              }
            }
          }
        } catch {
          // JSON parse failed, continue
        }
      }
    }

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

      const offers = data.offers as Record<string, unknown> | undefined
      let coverCharge: string | undefined
      if (offers?.price) {
        coverCharge = `$${offers.price}`
      }

      return {
        title: decodeHtmlEntities(title),
        description: data.description ? decodeHtmlEntities(data.description as string) : undefined,
        startsAt,
        endsAt: data.endDate ? new Date(data.endDate as string) : undefined,
        coverCharge,
        ticketUrl: (offers?.url as string) || undefined,
        sourceUrl: (data.url as string) || this.config.url,
        sourceEventId: this.generateEventId(title, startsAt),
      }
    } catch {
      return null
    }
  }

  private generateEventId(title: string, date: Date): string {
    // Create a stable ID from title and date
    const dateStr = date.toISOString().split('T')[0]
    const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
    return `parlor-room-${dateStr}-${titleSlug}`
  }
}
