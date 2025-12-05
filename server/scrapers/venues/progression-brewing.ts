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
  url: 'https://progressionbrewing.com/taproom-events',
  enabled: true,
  schedule: '0 6 * * *',
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'TWENTY_ONE_PLUS', // Brewery/bar venue
}

interface MECEvent {
  ID: number
  title: string
  content?: string
  excerpt?: string
  date?: {
    start?: { date: string; time?: string }
    end?: { date: string; time?: string }
  }
  featured_image?: string
  permalink?: string
  meta?: {
    mec_cost?: string
    mec_date?: string
    mec_start_time?: string
    mec_end_time?: string
  }
}

export class ProgressionBrewingScraper extends HttpScraper {
  constructor() {
    super(progressionBrewingConfig)
  }

  async scrape() {
    const startTime = Date.now()
    const errors: string[] = []
    let events: ScrapedEvent[] = []

    try {
      // First, try the MEC REST API
      events = await this.fetchFromApi()

      // If API didn't work, fall back to HTML scraping
      if (events.length === 0) {
        console.log(`[${this.config.name}] API returned no events, falling back to HTML scraping`)
        const response = await fetch(this.config.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        })

        if (response.ok) {
          const html = await response.text()
          events = await this.parseEvents(html)
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

  // Legacy MEC parser (kept for backward compatibility)
  private parseMECEvent(data: MECEvent): ScrapedEvent | null {
    try {
      const title = data.title
      if (!title) return null

      // Parse date
      let startsAt: Date | null = null

      if (data.date?.start?.date) {
        const dateStr = data.date.start.date
        const timeStr = data.date.start.time || '19:00'
        startsAt = new Date(`${dateStr}T${timeStr}`)
      } else if (data.meta?.mec_date) {
        startsAt = new Date(data.meta.mec_date)
        if (data.meta.mec_start_time) {
          const [hours, minutes] = data.meta.mec_start_time.split(':').map(Number)
          startsAt.setHours(hours, minutes)
        }
      }

      if (!startsAt || isNaN(startsAt.getTime())) return null

      // Skip past events
      if (startsAt < new Date()) return null

      // Parse end time
      let endsAt: Date | undefined
      if (data.date?.end?.date) {
        const dateStr = data.date.end.date
        const timeStr = data.date.end.time || '22:00'
        endsAt = new Date(`${dateStr}T${timeStr}`)
      }

      // Get description - strip HTML
      let description = data.excerpt || data.content || ''
      description = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)

      // Get price
      const coverCharge = data.meta?.mec_cost ? `$${data.meta.mec_cost}` : undefined

      // Generate stable ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const sourceEventId = `progression-brewing-${dateStr}-${data.ID || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`

      return {
        title,
        description: description || undefined,
        imageUrl: data.featured_image || undefined,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl: data.permalink || this.config.url,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing MEC event:`, error)
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
      // Parse date like "22 November 2025"
      const dateMatch = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/)
      if (!dateMatch) return null

      const day = parseInt(dateMatch[1], 10)
      const monthName = dateMatch[2].toLowerCase()
      const year = parseInt(dateMatch[3], 10)

      const months: Record<string, number> = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      }

      const month = months[monthName]
      if (month === undefined) return null

      // Parse time like "7:00 pm" or "3:00 pm"
      let hours = 19 // Default to 7 PM
      let minutes = 0

      if (timeStr) {
        const timeMatch = timeStr.match(/(\d+):(\d+)\s*(am|pm)/i)
        if (timeMatch) {
          hours = parseInt(timeMatch[1], 10)
          minutes = parseInt(timeMatch[2], 10)
          const ampm = timeMatch[3]?.toLowerCase()
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
        date = new Date(`${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]}`)
        if (!isNaN(date.getTime())) {
          // Parse time if provided
          if (timeStr) {
            const timeMatch = timeStr.match(/(\d+):(\d+)\s*(am|pm)?/i)
            if (timeMatch) {
              let hours = parseInt(timeMatch[1], 10)
              const minutes = parseInt(timeMatch[2], 10)
              const ampm = timeMatch[3]?.toLowerCase()
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
