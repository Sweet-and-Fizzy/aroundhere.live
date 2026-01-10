import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'
import * as cheerio from 'cheerio'
import { fromZonedTime } from 'date-fns-tz'

/**
 * Scraper for Progression Brewing - WordPress with Modern Events Calendar (MEC)
 *
 * Uses MEC's AJAX endpoint to fetch events, then fetches individual event pages
 * to get images from the LD+JSON structured data.
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

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const $ = cheerio.load(html)
    const events: ScrapedEvent[] = []
    const eventsNeedingImages: ScrapedEvent[] = []

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
      const result = this.parseMECEventElement($, $el)
      if (result) {
        // Check for duplicates
        const isDupe = events.some((e) => e.sourceEventId === result.event.sourceEventId)
        if (!isDupe) {
          events.push(result.event)
          if (result.needsImageFetch) {
            eventsNeedingImages.push(result.event)
          }
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

    // Fetch details from individual event pages for events that need them
    if (eventsNeedingImages.length > 0) {
      console.log(`[${this.config.name}] Fetching details for ${eventsNeedingImages.length} events`)
      await Promise.all(
        eventsNeedingImages.map(async (event) => {
          const details = await this.fetchEventDetails(event.sourceUrl)
          if (details.imageUrl) {
            event.imageUrl = details.imageUrl
          }
          if (details.description) {
            event.description = details.description
          }
        })
      )
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
  ): { event: ScrapedEvent; needsImageFetch: boolean } | null {
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

      // Get image from list (usually not present)
      const imageUrl = $el.find('img').first().attr('src') || undefined

      // Generate stable ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      const sourceEventId = `progression-brewing-${dateStr}-${titleSlug}`

      return {
        event: {
          title,
          imageUrl,
          startsAt,
          endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
          sourceUrl,
          sourceEventId,
        },
        needsImageFetch: !imageUrl && sourceUrl !== this.config.url,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing MEC event element:`, error)
      return null
    }
  }

  /**
   * Fetch image and description from an event's detail page using LD+JSON
   */
  private async fetchEventDetails(eventUrl: string): Promise<{ imageUrl?: string; description?: string }> {
    try {
      const response = await fetch(eventUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })

      if (!response.ok) return {}

      const html = await response.text()
      const $ = cheerio.load(html)

      let imageUrl: string | undefined
      let description: string | undefined

      $('script[type="application/ld+json"]').each((_, el) => {
        if (imageUrl && description) return // Already found both

        try {
          const data = JSON.parse($(el).html() || '')

          // Handle @graph structure
          if (data['@graph']) {
            for (const item of data['@graph']) {
              if (item['@type'] === 'Article') {
                if (!imageUrl && item.image) {
                  imageUrl = item.image.url || item.image
                }
                if (!description && item.description) {
                  description = item.description
                }
              }
            }
          }

          // Handle direct Event type
          if (data['@type'] === 'Event' || data['@type'] === 'MusicEvent') {
            if (!imageUrl && data.image) {
              imageUrl = typeof data.image === 'string' ? data.image : data.image.url
            }
            if (!description && data.description) {
              description = data.description
            }
          }
        } catch {
          // JSON parse failed
        }
      })

      return { imageUrl, description }
    } catch (error) {
      console.error(`[${this.config.name}] Error fetching event details from ${eventUrl}:`, error)
      return {}
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
        // Compare dates only (ignore time) so today's events don't get bumped to next year
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const testDate = new Date(currentYear, month, day)
        year = testDate < today ? currentYear + 1 : currentYear
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
