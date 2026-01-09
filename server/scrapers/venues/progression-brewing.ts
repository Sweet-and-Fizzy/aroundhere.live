import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'
import * as cheerio from 'cheerio'
import { fromZonedTime } from 'date-fns-tz'

// Type for Tribe Events Calendar API response data
interface TribeEventData {
  title?: string
  name?: string
  start_date?: string
  start_utc?: string
  end_date?: string
  end_utc?: string
  description?: string
  excerpt?: string
  url?: string
  permalink?: string
  id?: string | number
  image?: { url?: string }
  featured_image?: string
  cost?: string | number
}

/**
 * Scraper for Progression Brewing - WordPress with Modern Events Calendar (MEC)
 *
 * MEC is a popular WordPress events plugin that provides:
 * - REST API endpoints at /wp-json/mec/v1.0/events
 * - Structured data in event pages
 * - Calendar views with event listings
 */

export const progressionBrewingConfig: ScraperConfig = {
  id: 'progression-brewing',
  name: 'Progression Brewing Company',
  venueSlug: 'progression-brewing',
  url: 'https://progressionbrewing.com/taproom-events/',
  enabled: true,
  schedule: '0 6,14 * * *',
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'TWENTY_ONE_PLUS', // Brewery/bar venue
}

export class ProgressionBrewingScraper extends HttpScraper {
  constructor() {
    super(progressionBrewingConfig)
  }

  override async scrape() {
    const startTime = Date.now()
    const errors: string[] = []
    let events: ScrapedEvent[] = []

    try {
      // First, try the MEC REST API
      events = await this.fetchFromApi()

      // If API didn't work, fall back to MEC AJAX endpoint
      if (events.length === 0) {
        console.log(`[${this.config.name}] API returned no events, trying MEC AJAX`)

        // Fetch initial page to get the MEC skin ID
        const response = await fetch(this.config.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        })

        if (response.ok) {
          const html = await response.text()

          // Use MEC AJAX to get all events (returns more than initial page)
          events = await this.fetchMECAllEvents(html)

          // If AJAX failed, fall back to parsing initial HTML
          if (events.length === 0) {
            console.log(`[${this.config.name}] MEC AJAX returned no events, parsing initial HTML`)
            events = await this.parseEvents(html)
          }
        }
      }

      console.log(`[${this.config.name}] Scraped ${events.length} events`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push(message)
      console.error(`[${this.config.name}] Scrape error:`, message)
    }

    return {
      success: errors.length === 0,
      events,
      errors,
      scrapedAt: new Date(),
      duration: Date.now() - startTime,
    }
  }

  /**
   * Fetch all events using MEC's AJAX endpoint
   * The MEC AJAX endpoint returns more events than the initial page render
   */
  private async fetchMECAllEvents(initialHtml: string): Promise<ScrapedEvent[]> {
    const $ = cheerio.load(initialHtml)

    // Find the MEC skin container to extract the skin ID
    const skinContainer = $('[id^="mec_skin_"]').first()
    if (!skinContainer.length) {
      console.log(`[${this.config.name}] No MEC skin container found`)
      return []
    }

    // Extract skin ID from container id (e.g., "mec_skin_5249")
    const skinId = skinContainer.attr('id')?.replace('mec_skin_', '')
    if (!skinId) {
      console.log(`[${this.config.name}] Could not extract MEC skin ID`)
      return []
    }

    // MEC AJAX endpoint - using offset=1 returns all available events (up to 12)
    const ajaxUrl = 'https://progressionbrewing.com/wp-admin/admin-ajax.php'

    try {
      const formData = new URLSearchParams()
      formData.append('action', 'mec_grid_load_more')
      formData.append('mec_skin', skinId)
      formData.append('mec_offset', '1')

      const response = await fetch(ajaxUrl, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: formData.toString(),
      })

      if (!response.ok) {
        console.log(`[${this.config.name}] MEC AJAX request failed: ${response.status}`)
        return []
      }

      const data = await response.json()

      // MEC returns {html: "...", end: true/false, ...}
      if (data.html) {
        const events = await this.parseEvents(data.html)
        console.log(`[${this.config.name}] Loaded ${events.length} events from MEC AJAX`)
        return events
      }
    } catch (error) {
      console.log(`[${this.config.name}] Error fetching from MEC AJAX:`, error)
    }

    return []
  }

  private async fetchFromApi(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = []

    // Progression Brewing uses The Events Calendar (Tribe Events)
    // Use the Tribe Events REST API with proper date filtering
    const today = new Date().toISOString().split('T')[0]
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    const endDate = nextYear.toISOString().split('T')[0]

    const apiEndpoint = `https://progressionbrewing.com/wp-json/tribe/events/v1/events?start_date=${today}&end_date=${endDate}&per_page=50`

    try {
      const response = await fetch(apiEndpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        // Tribe Events API returns {events: [], total: 0, ...}
        const eventList = Array.isArray(data.events) ? data.events : []

        for (const item of eventList) {
          const event = this.parseTribeEvent(item)
          if (event) {
            events.push(event)
          }
        }

        if (events.length > 0) {
          console.log(`[${this.config.name}] Found ${events.length} events from Tribe Events API`)
          return events
        }
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error fetching from API:`, error)
    }

    return events
  }

  private parseTribeEvent(data: TribeEventData): ScrapedEvent | null {
    try {
      const title = data.title || data.name
      if (!title) return null

      // Parse start date
      let startsAt: Date | null = null
      if (data.start_date) {
        startsAt = new Date(data.start_date)
      } else if (data.start_utc) {
        startsAt = new Date(data.start_utc)
      }

      if (!startsAt || isNaN(startsAt.getTime())) return null

      // Skip past events
      if (startsAt < new Date()) return null

      // Parse end date
      let endsAt: Date | undefined
      if (data.end_date) {
        endsAt = new Date(data.end_date)
      } else if (data.end_utc) {
        endsAt = new Date(data.end_utc)
      }

      // Get description
      let description = data.description || data.excerpt || ''
      if (typeof description === 'string') {
        description = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
      }

      // Get image
      const imageUrl = data.image?.url || data.featured_image || undefined

      // Get price
      let coverCharge: string | undefined
      if (data.cost) {
        coverCharge = typeof data.cost === 'string' ? data.cost : `$${data.cost}`
      }

      // Generate stable ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      const sourceEventId = `progression-brewing-${dateStr}-${titleSlug}`

      return {
        title,
        description: description || undefined,
        imageUrl,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl: data.url || data.permalink || this.config.url,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing Tribe event:`, error)
      return null
    }
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const $ = cheerio.load(html)
    const events: ScrapedEvent[] = []

    // Try to extract from LD+JSON first
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '')
        const items = Array.isArray(data) ? data : [data]

        for (const item of items) {
          if (item['@type'] === 'Event' || item['@type'] === 'MusicEvent') {
            const event = this.parseEventSchema(item)
            if (event) events.push(event)
          }
        }
      } catch {
        // JSON parse failed
      }
    })

    // Progression Brewing uses MEC (Modern Events Calendar) on /taproom-events
    // Try MEC-specific selectors first
    $('.mec-event-article, .mec-event-list-item').each((_, el) => {
      const $el = $(el)
      const event = this.parseMECEventElement($, $el)
      if (event) {
        // Check for duplicates
        const isDupe = events.some((e) => e.sourceEventId === event.sourceEventId)
        if (!isDupe) {
          events.push(event)
        }
      }
    })

    // Also try Tribe Events-specific selectors (fallback for /events/ page)
    $('.tribe-events-calendar-list__event, .tribe-events-list__event, .tribe-events-widget-events-list__event').each((_, el) => {
      const $el = $(el)
      const event = this.parseEventElement($, $el)
      if (event) {
        // Check for duplicates
        const isDupe = events.some((e) => e.sourceEventId === event.sourceEventId)
        if (!isDupe) {
          events.push(event)
        }
      }
    })

    // Also try generic event selectors if no MEC elements found
    if (events.length === 0) {
      $('.event-item, .event-card, article.event').each((_, el) => {
        const $el = $(el)
        const event = this.parseEventElement($, $el)
        if (event) events.push(event)
      })
    }

    return events
  }

  private parseEventSchema(data: Record<string, unknown>): ScrapedEvent | null {
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
          coverCharge = `$${offer.price}`
        }
      }

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      const sourceEventId = `progression-brewing-${dateStr}-${titleSlug}`

      return {
        title,
        description: data.description as string | undefined,
        imageUrl,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl: (data.url as string) || this.config.url,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing event schema:`, error)
      return null
    }
  }

  private parseMECEventElement(
    $: cheerio.CheerioAPI,
    $el: ReturnType<cheerio.CheerioAPI>
  ): ScrapedEvent | null {
    try {
      // Get title from MEC event title link
      const titleLink = $el.find('.mec-event-title a').first()
      const title = titleLink.text().trim() || $el.find('.mec-event-title').first().text().trim()
      if (!title) return null

      // Get date from MEC date label
      const dateLabel = $el.find('.mec-start-date-label').first().text().trim()
      const startTime = $el.find('.mec-start-time').first().text().trim()
      const endTime = $el.find('.mec-end-time').first().text().trim()

      if (!dateLabel) return null

      // Parse date (format: "22 November 2025")
      const startsAt = this.parseMECDate(dateLabel, startTime)
      if (!startsAt || isNaN(startsAt.getTime())) return null

      // Skip past events (but allow today's events)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const eventDate = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate())
      if (eventDate < today) return null

      // Parse end time
      let endsAt: Date | undefined
      if (endTime) {
        endsAt = this.parseMECDate(dateLabel, endTime) ?? undefined
      }

      // Get link
      const link = titleLink.attr('href') || $el.find('a.mec-booking-button').first().attr('href')
      const sourceUrl = link
        ? link.startsWith('http')
          ? link
          : `https://progressionbrewing.com${link}`
        : this.config.url

      // Get image
      const imageUrl = $el.find('img').first().attr('src') || undefined

      // Generate stable ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      const sourceEventId = `progression-brewing-${dateStr}-${titleSlug}`

      return {
        title,
        imageUrl,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl,
        sourceEventId,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing MEC event element:`, error)
      return null
    }
  }

  private parseMECDate(dateStr: string, timeStr?: string): Date | null {
    try {
      const months: Record<string, number> = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      }

      let day: number
      let monthName: string
      let year: number

      // Try parsing with year: "22 November 2025"
      const dateMatchWithYear = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/)
      if (dateMatchWithYear) {
        day = parseInt(dateMatchWithYear[1] ?? '1', 10)
        monthName = (dateMatchWithYear[2] ?? '').toLowerCase()
        year = parseInt(dateMatchWithYear[3] ?? '2025', 10)
      } else {
        // Try parsing without year: "10 January" or "04 February"
        const dateMatchNoYear = dateStr.match(/(\d+)\s+(\w+)/)
        if (!dateMatchNoYear) return null

        day = parseInt(dateMatchNoYear[1] ?? '1', 10)
        monthName = (dateMatchNoYear[2] ?? '').toLowerCase()

        // Infer year: if date appears to be in the past, use next year
        const now = new Date()
        const currentYear = now.getFullYear()
        const month = months[monthName]

        if (month === undefined) return null

        // Check if this date has already passed this year
        const testDate = new Date(currentYear, month, day)
        year = testDate < now ? currentYear + 1 : currentYear
      }

      const month = months[monthName]
      if (month === undefined) return null

      // Parse time like "7:00 pm" or "3:00 pm"
      let hours = 19 // Default to 7 PM
      let minutes = 0

      if (timeStr) {
        const timeMatch = timeStr.match(/(\d+):(\d+)\s*(am|pm)/i)
        if (timeMatch) {
          hours = parseInt(timeMatch[1] ?? '19', 10)
          minutes = parseInt(timeMatch[2] ?? '0', 10)
          const ampm = (timeMatch[3] ?? '').toLowerCase()
          if (ampm === 'pm' && hours < 12) hours += 12
          if (ampm === 'am' && hours === 12) hours = 0
        }
      }

      // Create date in venue timezone (America/New_York)
      const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
      return fromZonedTime(localDateStr, this.config.timezone)
    } catch {
      return null
    }
  }

  private parseEventElement(
    $: cheerio.CheerioAPI,
    $el: ReturnType<cheerio.CheerioAPI>
  ): ScrapedEvent | null {
    try {
      // Get title
      const title = $el.find('.tribe-events-list-event-title, .tribe-events-calendar-list__event-title, .event-title, h2, h3').first().text().trim()
      if (!title) return null

      // Get date
      let startsAt: Date | null = null

      // Tribe Events format
      const tribeDate = $el.find('.tribe-event-date-start, .tribe-events-start-date').attr('datetime') || 
                        $el.find('.tribe-event-date-start, .tribe-events-start-date').text().trim()
      const tribeTime = $el.find('.tribe-event-time, .tribe-events-start-time').text().trim()

      if (tribeDate) {
        startsAt = new Date(tribeDate)
        if (isNaN(startsAt.getTime()) && tribeTime) {
          startsAt = this.parseDate(tribeDate, tribeTime)
        }
      }

      // Try datetime attribute
      if (!startsAt) {
        const datetime = $el.find('time[datetime]').attr('datetime')
        if (datetime) {
          startsAt = new Date(datetime)
        }
      }

      if (!startsAt || isNaN(startsAt.getTime())) return null

      // Skip past events
      if (startsAt < new Date()) return null

      // Get link
      const link = $el.find('a').first().attr('href')
      const sourceUrl = link
        ? link.startsWith('http')
          ? link
          : `https://progressionbrewing.com${link}`
        : this.config.url

      // Get image
      const imageUrl = $el.find('img').first().attr('src') || undefined

      // Get price
      const priceText = $el.find('.mec-event-price, .price, .ticket-price').text()
      const priceMatch = priceText.match(/\$[\d,.]+/)
      const coverCharge = priceMatch ? priceMatch[0] : undefined

      // Generate stable ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      const sourceEventId = `progression-brewing-${dateStr}-${titleSlug}`

      return {
        title,
        imageUrl,
        startsAt,
        sourceUrl,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing event element:`, error)
      return null
    }
  }

  private parseDate(dateStr: string, timeStr?: string): Date | null {
    try {
      // Try direct parsing first
      const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr
      let date = new Date(combined)

      if (!isNaN(date.getTime())) {
        return date
      }

      // Try parsing common MEC formats
      // "Saturday, December 14, 2024"
      const monthDayYear = dateStr.match(
        /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*(\w+)\s+(\d+),?\s*(\d{4})/i
      )
      if (monthDayYear) {
        date = new Date(`${monthDayYear[1] ?? ''} ${monthDayYear[2] ?? ''}, ${monthDayYear[3] ?? ''}`)
        if (!isNaN(date.getTime())) {
          // Parse time if provided
          if (timeStr) {
            const timeMatch = timeStr.match(/(\d+):(\d+)\s*(am|pm)?/i)
            if (timeMatch) {
              let hours = parseInt(timeMatch[1] ?? '19', 10)
              const minutes = parseInt(timeMatch[2] ?? '0', 10)
              const ampm = (timeMatch[3] ?? '').toLowerCase()
              if (ampm === 'pm' && hours < 12) hours += 12
              if (ampm === 'am' && hours === 12) hours = 0
              date.setHours(hours, minutes, 0, 0)
            }
          } else {
            // Default to 7 PM for evening events
            date.setHours(19, 0, 0, 0)
          }
          return date
        }
      }

      return null
    } catch {
      return null
    }
  }
}
