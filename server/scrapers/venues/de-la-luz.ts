import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'
import * as cheerio from 'cheerio'

/**
 * Scraper for De La Luz - WordPress site with WooCommerce/FooEvents
 *
 * The site uses WooCommerce for ticket sales with the FooEvents calendar plugin.
 * Events are listed on /events/ with links to individual event pages.
 * Each event page has product/event structured data.
 */

export const deLaLuzConfig: ScraperConfig = {
  id: 'de-la-luz',
  name: 'De La Luz',
  venueSlug: 'de-la-luz',
  url: 'https://delaluz.org/',
  enabled: true,
  schedule: '0 6,14 * * *',
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'ALL_AGES', // Concert hall - varies by show
}

export class DeLaLuzScraper extends HttpScraper {
  constructor() {
    super(deLaLuzConfig)
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const $ = cheerio.load(html)
    const events: ScrapedEvent[] = []
    const eventLinks: string[] = []

    // First, try to extract events from LD+JSON on the homepage
    const structuredDataEvents: Array<{ data: Record<string, unknown>; url?: string }> = []
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '')
        const items = Array.isArray(data) ? data : (data['@graph'] || [data])

        for (const item of items) {
          if (item['@type'] === 'Event' || item['@type'] === 'MusicEvent') {
            // Try to extract URL from structured data
            const eventUrl = 
              (item.url as string) ||
              (item.mainEntityOfPage as string) ||
              (Array.isArray(item.sameAs) ? item.sameAs[0] : (item.sameAs as string))
            
            structuredDataEvents.push({ data: item, url: eventUrl })
          }
        }
      } catch {
        // JSON parse failed
      }
    })

    // Otherwise, find all event links on the listing page
    // FooEvents typically uses product-style listings
    $('a[href*="/events/"]').each((_, el) => {
      const href = $(el).attr('href')
      if (href && href.includes('/events/') && !href.endsWith('/events/')) {
        // Skip pagination and category links
        if (!href.includes('/page/') && !href.includes('/category/')) {
          eventLinks.push(href)
        }
      }
    })

    // Also try to find events in a calendar or list structure
    $('.tribe-events-calendar-list__event-row a, .fooevents-event a, .product a, .event-card a, .event-item a, article.event a').each((_, el) => {
      const href = $(el).attr('href')
      if (href && href.includes('/events/') && !href.endsWith('/events/')) {
        eventLinks.push(href)
      }
    })

    // Also look for any links that might be event pages (broader search)
    $('a[href*="event"]').each((_, el) => {
      const href = $(el).attr('href')
      if (href && !href.endsWith('/events/') && !href.includes('/page/') && !href.includes('/category/')) {
        // Check if it looks like an event URL
        if (href.match(/\/events\/[^/]+/) || href.match(/\/event\/[^/]+/)) {
          eventLinks.push(href)
        }
      }
    })

    // Dedupe links
    const uniqueLinks = [...new Set(eventLinks)]

    // Normalize URLs (convert relative to absolute)
    const normalizedLinks = uniqueLinks.map((link) => {
      try {
        // If already absolute, return as-is
        if (link.startsWith('http://') || link.startsWith('https://')) {
          return link
        }
        // Use URL constructor to resolve relative URLs
        return new URL(link, this.config.url).href
      } catch {
        // If URL parsing fails, return original link
        return link
      }
    })

    console.log(`[${this.config.name}] Found ${normalizedLinks.length} event links`)

    // Always fetch individual event pages to get accurate pricing
    // The homepage structured data doesn't include price ranges
    for (const link of normalizedLinks) {
      try {
        const event = await this.scrapeEventPage(link)
        if (event) {
          events.push(event)
        }
        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 300))
      } catch (error) {
        console.error(`[${this.config.name}] Error scraping ${link}:`, error)
      }
    }

    return events
  }

  private async scrapeEventPage(url: string): Promise<ScrapedEvent | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })

      if (!response.ok) {
        console.error(`[${this.config.name}] HTTP ${response.status} for ${url}`)
        return null
      }

      const html = await response.text()
      const $ = cheerio.load(html)

      // Extract price range from HTML (more accurate than structured data)
      const priceFromHtml = this.extractPriceFromHtml($)

      // Try to extract from LD+JSON first (most reliable)
      let eventData: ScrapedEvent | null = null

      $('script[type="application/ld+json"]').each((_, el) => {
        if (eventData) return // Already found one

        try {
          const jsonText = $(el).html() || ''
          const data = JSON.parse(jsonText)

          // Handle array of schema objects
          const items = Array.isArray(data) ? data : (data['@graph'] || [data])

          for (const item of items) {
            const itemType = item['@type']

            // Support Event, MusicEvent, TheaterEvent, and other event types
            if (itemType === 'Event' || itemType === 'MusicEvent' || itemType === 'TheaterEvent' ||
                (typeof itemType === 'string' && itemType.endsWith('Event'))) {
              eventData = this.parseEventSchema(item, url)
              if (eventData) break
            }
            // FooEvents sometimes uses Product schema
            if (itemType === 'Product' && item.name) {
              eventData = this.parseProductSchema(item, url, $)
              if (eventData) break
            }
          }
        } catch {
          // JSON parse failed - try to extract just the event part
          console.log(`[${this.config.name}] JSON parse error for ${url}, trying fallback`)
        }
      })

      // If no structured data, try to parse from HTML
      if (!eventData) {
        eventData = this.parseEventFromHtml($, url)
      }

      // Override cover charge with HTML-extracted price if available (more accurate)
      if (eventData && priceFromHtml) {
        eventData.coverCharge = priceFromHtml
      }

      return eventData
    } catch (error) {
      console.error(`[${this.config.name}] Error fetching ${url}:`, error)
      return null
    }
  }

  /**
   * Extract price range from HTML - De La Luz uses WooCommerce with variable pricing
   * The most reliable source is the data-product_variations JSON attribute
   */
  private extractPriceFromHtml($: cheerio.CheerioAPI): string | undefined {
    // Best source: data-product_variations JSON contains display_price for each tier
    const variationsEl = $('[data-product_variations]')
    if (variationsEl.length) {
      try {
        const variationsJson = variationsEl.attr('data-product_variations')
        if (variationsJson) {
          const variations = JSON.parse(variationsJson) as Array<{ display_price?: number }>
          const prices = variations
            .map(v => v.display_price)
            .filter((p): p is number => typeof p === 'number')

          if (prices.length > 0) {
            const minPrice = Math.min(...prices)
            const maxPrice = Math.max(...prices)

            // Handle free events
            if (maxPrice === 0) {
              return 'Free'
            }

            return minPrice === maxPrice ? `$${minPrice}` : `$${minPrice}-$${maxPrice}`
          }
        }
      } catch {
        // JSON parse error, fall through to other methods
      }
    }

    // Fallback: Look for price display in .bde-text elements
    const priceEl = $('.bde-text .woocommerce-Price-amount')
    if (priceEl.length >= 1) {
      const prices: number[] = []
      priceEl.each((_, el) => {
        const text = $(el).text().replace(/[^0-9.]/g, '')
        const price = parseFloat(text)
        if (!isNaN(price)) {
          prices.push(price)
        }
      })

      if (prices.length > 0) {
        const minPrice = Math.min(...prices)
        const maxPrice = Math.max(...prices)

        if (maxPrice === 0) {
          return 'Free'
        }

        return minPrice === maxPrice ? `$${minPrice}` : `$${minPrice}-$${maxPrice}`
      }
    }

    return undefined
  }

  private parseEventSchema(data: Record<string, unknown>, sourceUrl: string): ScrapedEvent | null {
    try {
      const title = data.name as string
      if (!title) return null

      const startDate = data.startDate as string
      if (!startDate) return null

      console.log(`[${this.config.name}] parseEventSchema: startDate="${startDate}" for "${title}"`)

      // De La Luz has malformed dates like "2025-11-22T1763856000America/New_York"
      // The format includes a Unix timestamp after the T
      let startsAt: Date
      
      // First, try to extract the Unix timestamp (10 digits after T)
      const timestampMatch = startDate.match(/T(\d{10})(?:\d{3})?/)
      if (timestampMatch && timestampMatch[1]) {
        const timestamp = parseInt(timestampMatch[1], 10)
        // It's a Unix timestamp in seconds, convert to milliseconds
        startsAt = new Date(timestamp * 1000)
        console.log(`[${this.config.name}] parseEventSchema: Extracted timestamp ${timestamp}, created ${startsAt.toISOString()}`)
      } else {
        // Fallback: Extract date part (YYYY-MM-DD)
        const dateMatch = startDate.match(/^(\d{4}-\d{2}-\d{2})/)
        if (dateMatch && dateMatch[1]) {
          const dateStr = dateMatch[1]
          // Create date in local timezone (will be converted properly)
          const parts = dateStr.split('-')
          const year = Number(parts[0])
          const month = Number(parts[1])
          const day = Number(parts[2])
          startsAt = new Date(year, month - 1, day, 19, 0, 0) // Default to 7 PM local time
        } else {
          startsAt = new Date(startDate)
        }
      }
      if (isNaN(startsAt.getTime())) {
        return null
      }

      // Skip past events - compare dates at midnight in the event's timezone
      // Don't filter based on time, just check if the date has passed
      const now = new Date()
      // Get the date portion (year-month-day) for comparison
      const eventDate = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate())
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      
      if (eventDate < todayDate) {
        return null
      }

      const endDate = data.endDate as string
      const endsAt = endDate ? new Date(endDate) : undefined

      // Get image
      let imageUrl: string | undefined
      const image = data.image
      if (Array.isArray(image) && image.length > 0) {
        imageUrl = typeof image[0] === 'string' ? image[0] : (image[0] as Record<string, string>)?.url
      } else if (typeof image === 'string') {
        imageUrl = image
      } else if (image && typeof image === 'object') {
        imageUrl = (image as Record<string, string>)?.url
      }

      // Get price - will be enhanced with full range from HTML later
      let coverCharge: string | undefined
      const offers = data.offers as Record<string, unknown> | Record<string, unknown>[]
      if (offers) {
        const offersList = Array.isArray(offers) ? offers : [offers]
        // Try to get price range if multiple offers
        const prices = offersList
          .map(o => parseFloat(String(o?.price || o?.lowPrice || '')))
          .filter(p => !isNaN(p))

        if (prices.length > 1) {
          const minPrice = Math.min(...prices)
          const maxPrice = Math.max(...prices)
          coverCharge = minPrice === maxPrice ? `$${minPrice}` : `$${minPrice}-${maxPrice}`
        } else if (prices.length === 1) {
          coverCharge = `$${prices[0]}`
        }
      }

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const urlSlug = sourceUrl.split('/').filter(Boolean).pop() || ''
      const sourceEventId = `de-la-luz-${dateStr}-${urlSlug}`

      return {
        title,
        description: data.description as string | undefined,
        imageUrl,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing event schema:`, error)
      return null
    }
  }

  private parseProductSchema(
    data: Record<string, unknown>,
    sourceUrl: string,
    $: cheerio.CheerioAPI
  ): ScrapedEvent | null {
    try {
      const title = data.name as string
      if (!title) return null

      // For product schema, we need to find the date from the page content
      let startsAt: Date | null = null
      const dateSelectors = [
        '.fooevents-date',
        '.event-date',
        '.tribe-event-date-start',
        '.event-meta time',
        'time[datetime]',
        '.woocommerce-product-details__short-description time',
        '.product_meta time',
        '[class*="date"]',
        '[class*="event-date"]',
        '.entry-meta time',
        'meta[property="event:start_time"]',
        'meta[name="event:start_time"]',
      ]

      for (const selector of dateSelectors) {
        const el = $(selector).first()
        if (el.length) {
          const datetime = el.attr('datetime') || el.attr('content') || el.text()
          if (datetime) {
            startsAt = new Date(datetime)
            if (!isNaN(startsAt.getTime())) break
          }
        }
      }

      // Also try looking in the content for date patterns
      if (!startsAt || isNaN(startsAt.getTime())) {
        const pageText = $('body').text()
        
        // Match patterns like "Saturday, November 22, 2025" or "November 22, 2025"
        let dateMatch = pageText.match(
          /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?,?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
        )
        
        // Also try abbreviated months like "Nov 22, 2025"
        if (!dateMatch) {
          dateMatch = pageText.match(
            /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?,?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i
          )
        }
        
        // Also try ISO format dates like "2025-11-22"
        if (!dateMatch) {
          dateMatch = pageText.match(/(\d{4})-(\d{2})-(\d{2})/)
          if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
            const year = parseInt(dateMatch[1], 10)
            const month = parseInt(dateMatch[2], 10) - 1 // JS months are 0-indexed
            const day = parseInt(dateMatch[3], 10)
            startsAt = new Date(year, month, day, 19, 0, 0)
          }
        }

        if (dateMatch && !startsAt && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
          const monthStr = dateMatch[1]
          const day = parseInt(dateMatch[2], 10)
          const year = parseInt(dateMatch[3], 10)
          const months: Record<string, number> = {
            january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
            may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
            september: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
          }
          const month = months[monthStr.toLowerCase()]
          if (month !== undefined) {
            startsAt = new Date(year, month, day, 19, 0, 0) // Default 7 PM
          }
        }
      }

      // Try to extract time if we have a date but want to set a specific time
      if (startsAt && !isNaN(startsAt.getTime())) {
        const timeText = $('.event-time, .fooevents-time, time').first().text()
        const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)
        if (timeMatch && timeMatch[1] && timeMatch[2]) {
          let hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const ampm = timeMatch[3]?.toLowerCase()
          if (ampm === 'pm' && hours < 12) hours += 12
          if (ampm === 'am' && hours === 12) hours = 0
          startsAt.setHours(hours, minutes, 0, 0)
        }
      }

      if (!startsAt || isNaN(startsAt.getTime())) {
        console.log(`[${this.config.name}] Could not parse date for: ${title}`)
        return null
      }

      // Skip past events
      if (startsAt < new Date()) return null

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
      const offers = data.offers as Record<string, unknown>
      if (offers?.price) {
        coverCharge = `$${offers.price}`
      }

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const urlSlug = sourceUrl.split('/').filter(Boolean).pop() || ''
      const sourceEventId = `de-la-luz-${dateStr}-${urlSlug}`

      return {
        title,
        description: data.description as string | undefined,
        imageUrl,
        startsAt,
        sourceUrl,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing product schema:`, error)
      return null
    }
  }

  private parseEventFromHtml($: cheerio.CheerioAPI, sourceUrl: string): ScrapedEvent | null {
    try {
      // Try various selectors for title
      const title =
        $('h1.entry-title, h1.product_title, .event-title h1').first().text().trim() ||
        $('h1').first().text().trim()

      if (!title) return null

      // Try to find date
      let startsAt: Date | null = null
      const dateSelectors = [
        '.fooevents-date',
        '.event-date',
        '.tribe-event-date-start',
        '.event-meta time',
        'time[datetime]',
        '.woocommerce-product-details__short-description time',
        '.product_meta time',
        '[class*="date"]',
        '[class*="event-date"]',
        '.entry-meta time',
        'meta[property="event:start_time"]',
        'meta[name="event:start_time"]',
      ]

      for (const selector of dateSelectors) {
        const el = $(selector).first()
        if (el.length) {
          const datetime = el.attr('datetime') || el.attr('content') || el.text()
        if (datetime) {
          startsAt = new Date(datetime)
          if (!isNaN(startsAt.getTime())) break
          }
        }
      }

      // Also try looking in the content for date patterns
      if (!startsAt || isNaN(startsAt.getTime())) {
        const pageText = $('body').text()
        
        // Match patterns like "Saturday, November 22, 2025" or "November 22, 2025"
        let dateMatch = pageText.match(
          /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?,?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
        )
        
        // Also try abbreviated months like "Nov 22, 2025"
        if (!dateMatch) {
          dateMatch = pageText.match(
            /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?,?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i
          )
        }
        
        // Also try ISO format dates like "2025-11-22"
        if (!dateMatch) {
          dateMatch = pageText.match(/(\d{4})-(\d{2})-(\d{2})/)
          if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
            const year = parseInt(dateMatch[1], 10)
            const month = parseInt(dateMatch[2], 10) - 1 // JS months are 0-indexed
            const day = parseInt(dateMatch[3], 10)
            startsAt = new Date(year, month, day, 19, 0, 0)
          }
        }

        if (dateMatch && !startsAt && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
          const monthStr = dateMatch[1]
          const day = parseInt(dateMatch[2], 10)
          const year = parseInt(dateMatch[3], 10)
          const months: Record<string, number> = {
            january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
            may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
            september: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
          }
          const month = months[monthStr.toLowerCase()]
          if (month !== undefined) {
            startsAt = new Date(year, month, day, 19, 0, 0) // Default 7 PM
          }
        }
      }

      // Try to extract time if we have a date but want to set a specific time
      if (startsAt && !isNaN(startsAt.getTime())) {
        const timeText = $('.event-time, .fooevents-time, time').first().text()
        const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)
        if (timeMatch && timeMatch[1] && timeMatch[2]) {
          let hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const ampm = timeMatch[3]?.toLowerCase()
          if (ampm === 'pm' && hours < 12) hours += 12
          if (ampm === 'am' && hours === 12) hours = 0
          startsAt.setHours(hours, minutes, 0, 0)
        }
      }

      if (!startsAt || isNaN(startsAt.getTime())) {
        console.log(`[${this.config.name}] Could not parse date from HTML for: ${title}`)
        console.log(`[${this.config.name}] URL: ${sourceUrl}`)
        // Log a sample of the page text to help debug
        const sampleText = $('body').text().substring(0, 500)
        console.log(`[${this.config.name}] Page text sample: ${sampleText}`)
        return null
      }

      // Skip past events
      if (startsAt < new Date()) return null

      // Get description
      const description =
        $('.event-description, .product-short-description, .entry-summary').first().text().trim() ||
        undefined

      // Get image
      const imageUrl =
        $('img.wp-post-image, .product-image img, .event-image img').first().attr('src') || undefined

      // Get price
      const priceText = $('.price, .ticket-price, .fooevents-price').first().text()
      const priceMatch = priceText.match(/\$[\d,.]+/)
      const coverCharge = priceMatch ? priceMatch[0] : undefined

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const urlSlug = sourceUrl.split('/').filter(Boolean).pop() || ''
      const sourceEventId = `de-la-luz-${dateStr}-${urlSlug}`

      return {
        title,
        description,
        imageUrl,
        startsAt,
        sourceUrl,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing HTML:`, error)
      return null
    }
  }
}
