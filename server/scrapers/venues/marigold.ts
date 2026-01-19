import { PlaywrightScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'

// Types for browser-evaluated data
interface GalleryEventData {
  href: string
  dateTitle: string
  description: string
  imageUrl?: string
  category?: string
}

import * as cheerio from 'cheerio'

/**
 * Scraper for Marigold Theater - WordPress site with Wonder Plugin Grid Gallery
 *
 * The site displays events in a grid/gallery format.
 * Each event links to a detail page with event information.
 */

export const marigoldConfig: ScraperConfig = {
  id: 'marigold',
  name: 'Marigold Theater',
  venueSlug: 'marigold-theater',
  url: 'https://marigold.org/',
  enabled: true,
  schedule: '0 6,14 * * *', // 6 AM and 2 PM daily
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'ALL_AGES', // Theater venue
}

export class MarigoldScraper extends PlaywrightScraper {
  constructor() {
    super(marigoldConfig)
  }

  // Use 'domcontentloaded' instead of 'networkidle' because the site has
  // persistent connections that prevent networkidle from being reached
  protected override getWaitUntilStrategy(): 'networkidle' | 'domcontentloaded' | 'load' | 'commit' {
    return 'domcontentloaded'
  }

  protected override async waitForContent(): Promise<void> {
    if (!this.page) return

    // Wait for WonderPlugin Grid Gallery to load
    // The gallery container starts with display:none until JS initializes it,
    // so we use state: 'attached' to wait for DOM presence, not visibility
    try {
      await this.page.waitForSelector('.wonderplugin-gridgallery-item', {
        state: 'attached',
        timeout: 10000,
      })
      // Wait for JS to initialize the gallery
      await this.page.waitForTimeout(2000)
    } catch {
      // If specific selectors don't appear, wait for general content
      await this.page.waitForTimeout(3000)
    }
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    if (!this.page) {
      // Fallback if no page available - try to parse from HTML
      return this.parseEventsFromHtml(html)
    }

    const events: ScrapedEvent[] = []
    
    // Wait for gallery to load and ensure "theater" category is selected
    await this.page.waitForSelector('.wonderplugin-gridgallery-item', { state: 'attached', timeout: 10000 })
    
    // Click on "Theater Events" category if not already selected
    try {
      const theaterTag = await this.page.$('.wonderplugin-gridgallery-tag[data-slug="theater"]')
      if (theaterTag) {
        const isSelected = await this.page.evaluate((el) => {
          return el.classList.contains('wonderplugin-gridgallery-tag-selected')
        }, theaterTag)
        if (!isSelected) {
          await theaterTag.click()
          await this.page.waitForTimeout(1000) // Wait for gallery to filter
        }
      }
    } catch {
      console.log(`[${this.config.name}] Could not select theater category, continuing anyway`)
    }
    
    // Extract events directly from gallery items on the listing page
    // This avoids rate limiting by not visiting individual pages
    // Only get visible items from "theater" category
    const galleryEvents = await this.page.evaluate((): GalleryEventData[] => {
      const events: GalleryEventData[] = []
      const items = document.querySelectorAll('.wonderplugin-gridgallery-item')
      
      items.forEach((item) => {
        // Only process visible items (not hidden by category filter)
        const style = window.getComputedStyle(item)
        if (style.display === 'none') return
        
        // Only get items from "theater" category
        const category = item.getAttribute('data-category')
        if (category && category !== 'theater') return
        
        const link = item.querySelector('a')
        if (!link) return
        
        const href = link.getAttribute('href')
        const dataTitle = link.getAttribute('data-title') // e.g., "SAT NOV 22"
        const dataDescription = link.getAttribute('data-description') || ''
        const img = item.querySelector('img')
        const imageUrl = img?.getAttribute('src') || undefined
        
        // Also get caption title
        const captionTitle = item.querySelector('.wonderplugin-gridgallery-item-caption-title')?.textContent?.trim()
        const finalDateTitle = dataTitle || captionTitle || ''
        
        if (
          href &&
          !href.includes('/wp-content/') &&
          !href.match(/\.(jpg|png|gif|webp)$/i) &&
          !href.endsWith('/events') &&
          !href.endsWith('/events/') &&
          href !== 'https://marigold.org/events' &&
          finalDateTitle && // Should have a date title
          finalDateTitle.match(/(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)\s+\d{1,2}/i) // Must match date pattern
        ) {
          events.push({
            href,
            dateTitle: finalDateTitle,
            description: dataDescription,
            imageUrl,
            category: category || undefined,
          })
        }
      })
      
      return events
    })
    
    // Parse events from gallery data
    for (const galleryEvent of galleryEvents) {
      const event = await this.parseGalleryEvent(galleryEvent)
      if (event) {
        events.push(event)
      }
    }
    
    // Gallery extraction is sufficient - LD+JSON doesn't respect category filters
    // and causes duplicates with slightly different titles

    return events
  }

  // Fallback method to parse from static HTML
  private async parseEventsFromHtml(html: string): Promise<ScrapedEvent[]> {
    const $ = cheerio.load(html)
    const events: ScrapedEvent[] = []

    // Extract from gallery items in HTML
    const galleryItems: { href: string; dateTitle: string; description: string; imageUrl?: string }[] = []
    $('.wonderplugin-gridgallery-item').each((_, el) => {
      const $item = $(el)
      const link = $item.find('a').first()
      const href = link.attr('href')
      const dataTitle = link.attr('data-title') || $item.find('.wonderplugin-gridgallery-item-caption-title').first().text().trim()
      const dataDescription = link.attr('data-description') || ''
      const img = $item.find('img').first()
      const imageUrl = img.attr('src')

      if (href && dataTitle && !href.includes('/wp-content/')) {
        galleryItems.push({
          href,
          dateTitle: dataTitle,
          description: dataDescription,
          imageUrl,
        })
      }
    })

    // Process items sequentially to await async parseGalleryEvent
    for (const galleryEvent of galleryItems) {
      const event = await this.parseGalleryEvent(galleryEvent)
      if (event) {
        events.push(event)
      }
    }

    return events
  }

  private async parseGalleryEvent(galleryEvent: { href: string; dateTitle: string; description: string; imageUrl?: string }): Promise<ScrapedEvent | null> {
    try {
      // Clean HTML tags from dateTitle
      const cleanDateTitle = galleryEvent.dateTitle.replace(/<[^>]+>/g, '').trim()
      
      // Parse date from title like "SAT NOV 22" or "FRI NOV 21" or "THU SEPT 25"
      // Handle both "SEP" and "SEPT"
      const dateMatch = cleanDateTitle.match(/(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)\s+(\d{1,2})/i)
      if (!dateMatch) {
        console.log(`[${this.config.name}] Could not parse date from: ${cleanDateTitle}`)
        return null
      }

      const monthNames: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
      }
      const monthStr = (dateMatch[1] ?? '').toLowerCase().slice(0, 3)
      const month = monthNames[monthStr]
      if (month === undefined) {
        console.log(`[${this.config.name}] Invalid month: ${monthStr}`)
        return null
      }

      const day = parseInt(dateMatch[2] ?? '', 10)
      if (isNaN(day) || day < 1 || day > 31) {
        console.log(`[${this.config.name}] Invalid day: ${dateMatch[2] ?? ''}`)
        return null
      }
      
      // Try to extract year from multiple sources
      let year: number | null = null
      const now = new Date()
      const currentYear = now.getFullYear()

      // Helper to check if a date with given year would be in the past
      const wouldBeInPast = (testYear: number) => {
        const testDate = this.createDateInTimezone(testYear, month, day, 20, 0)
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const eventDate = new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate())
        return eventDate < today
      }

      // Helper to check how many days in the past/future
      const daysFromNow = (testYear: number) => {
        const testDate = this.createDateInTimezone(testYear, month, day, 20, 0)
        return (testDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      }

      // 1. Check description for year (2024, 2025, 2026, etc.)
      const descriptionText = galleryEvent.description.replace(/<[^>]+>/g, ' ')
      const yearMatch = descriptionText.match(/\b(20[2-9]\d)\b/)
      if (yearMatch) {
        const foundYear = parseInt(yearMatch[1] ?? '', 10)
        // Validate: year should be reasonable (2020-2030)
        if (foundYear >= 2020 && foundYear <= 2030) {
          // If this year would be in the past but next year wouldn't, use next year
          // (description might have stale year from copied content)
          if (wouldBeInPast(foundYear) && !wouldBeInPast(foundYear + 1)) {
            year = foundYear + 1
          } else {
            year = foundYear
          }
        }
      }

      // 2. Check image URL for year (e.g., /2025/09/ in upload path)
      // NOTE: Image upload year doesn't always match event year! Skip this heuristic
      // and rely on the default logic which is smarter about recent past events.

      // 3. Default: use current year, or next year if date has passed
      if (!year) {
        const daysAgoThisYear = -daysFromNow(currentYear)

        if (!wouldBeInPast(currentYear)) {
          // Date is in the future this year - use current year
          year = currentYear
        } else if (daysAgoThisYear <= 14) {
          // Date is in the recent past (within 2 weeks) - it's a past event from this year
          // Don't push to next year, let it be filtered out as a past event
          year = currentYear
        } else if (!wouldBeInPast(currentYear + 1)) {
          // Date is more than 2 weeks in the past - probably next year's event
          // (e.g., in December, a Jan 15 date would be next year)
          year = currentYear + 1
        } else {
          // Date is in the past even for next year - genuinely past event
          year = currentYear
        }
      }

      // Final validation: if more than 14 months away, something is wrong
      const testDate = this.createDateInTimezone(year, month, day, 20, 0)
      const monthsAway = (testDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (monthsAway > 14) {
        year = currentYear
      }

      // Default to 8 PM for evening events - will be updated if we find actual time
      let hours = 20
      let minutes = 0
      let startsAt = this.createDateInTimezone(year, month, day, hours, minutes)

      // Skip past events - compare the event date (year/month/day we parsed) with today
      // Don't use startsAt directly since it's UTC-adjusted
      const todayInTz = new Date(now.toLocaleString('en-US', { timeZone: this.config.timezone }))
      const todayDate = new Date(todayInTz.getFullYear(), todayInTz.getMonth(), todayInTz.getDate())
      const eventDate = new Date(year, month, day)
      if (eventDate < todayDate) {
        console.log(`[${this.config.name}] Skipping past event: ${cleanDateTitle} (calculated as ${eventDate.toISOString().split('T')[0]}, ${monthsAway.toFixed(1)} months away)`)
        return null
      }

      // Extract title from description, cleaning HTML
      let title = galleryEvent.description
        .replace(/<[^>]+>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim()
      
      // Store description for later use
      let description: string | undefined = galleryEvent.description
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim()

      if (!title || title.length < 5) {
        // Try to extract from URL slug
        const urlMatch = galleryEvent.href.match(/\/([^/]+)\/?$/)
        if (urlMatch && urlMatch[1]) {
          title = urlMatch[1]
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        } else {
          title = cleanDateTitle // Fallback to date if no description
        }
      } else {
        // Clean up description - take first line or first 100 chars for title
        const firstLine = title.split('\n')[0]
        const firstPart = firstLine?.split('|')[0]
        title = (firstPart ?? title).trim().slice(0, 100)
      }
      
      // If description is empty or very short, we'll need to fetch it from the event page
      // But for now, keep what we have (might be empty)
      if (!description || description.length < 10) {
        description = undefined
      }

      // Normalize URL
      const sourceUrl = galleryEvent.href.startsWith('http')
        ? galleryEvent.href
        : `https://marigold.org${galleryEvent.href}`

      // Generate stable event ID from URL slug (not title, which can vary)
      const urlSlug = galleryEvent.href.match(/\/([^/]+)\/?$/)?.[1] || ''
      const dateStr = startsAt.toISOString().split('T')[0]
      const sourceEventId = `marigold-${dateStr}-${urlSlug}`.slice(0, 100)

      // Fetch from event page to get description, check for cancellation, and extract time
      let finalDescription = description
      let isCancelled = false
      let coverCharge: string | undefined
      try {
        // Use fetch instead of Playwright navigation to avoid closing the page
        const response = await fetch(galleryEvent.href, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        })

        if (response.ok) {
          const html = await response.text()
          const $ = cheerio.load(html)

          // Check if event is cancelled/postponed
          const pageText = $('body').text().toLowerCase()
          if (pageText.includes('cancelled') || pageText.includes('canceled') || pageText.includes('postponed')) {
            isCancelled = true
          }

          // Primary source: page <title> tag - most reliable
          // Format: "Event Name – Marigold" or "Event Name - Marigold"
          const pageTitle = $('title').text().trim()
          const titleMatch = pageTitle.match(/^(.+?)\s*[–-]\s*Marigold$/i)
          if (titleMatch && titleMatch[1] && titleMatch[1].length > 3) {
            title = titleMatch[1].trim()
          } else {
            // Fallback: Try to find title in h2
            const h2Title = $('h2').first().text().trim()
            if (h2Title && h2Title.length > 5) {
              title = h2Title
            }
          }

          // Extract ticket price from page content
          // Look for patterns like "🎟️$10" or "🎟️$20 Sliding Scale" or "Tickets: $15"
          $('p').each((_, el) => {
            if (coverCharge) return
            const text = $(el).text()

            // Match 🎟️$XX or 🎟️ $XX patterns (with optional description like "Sliding Scale")
            const ticketMatch = text.match(/🎟️\s*\$(\d+)(?:\s+[A-Za-z\s]+)?/i)
            if (ticketMatch) {
              // Extract the full price text including any suffix like "Sliding Scale"
              const fullMatch = text.match(/🎟️\s*(\$\d+(?:\s+[A-Za-z\s]+)?)/i)
              if (fullMatch?.[1]) {
                coverCharge = fullMatch[1].trim()
              }
            }

            // Also try "Tickets: $XX" or "Admission: $XX" patterns
            if (!coverCharge) {
              const altMatch = text.match(/(?:tickets?|admission|cover|entry):?\s*\$(\d+)/i)
              if (altMatch) {
                coverCharge = '$' + altMatch[1]
              }
            }

            // Check for free events
            if (!coverCharge && text.match(/(?:free|no cover|donation)/i)) {
              coverCharge = 'Free'
            }
          })

          // Parse time from page content
          // Look for patterns like "Doors: 7pm | Music: 8pm" or "Show: 9pm"
          let foundTime = false
          $('p').each((_, el) => {
            if (foundTime) return
            const text = $(el).text()

            // Match show/music time first (preferred)
            const showMatch = text.match(/(?:music|show):?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
            if (showMatch) {
              let parsedHours = parseInt(showMatch[1] ?? '0', 10)
              const parsedMinutes = showMatch[2] ? parseInt(showMatch[2], 10) : 0
              const ampm = (showMatch[3] ?? 'pm').toLowerCase()

              if (ampm === 'pm' && parsedHours < 12) parsedHours += 12
              if (ampm === 'am' && parsedHours === 12) parsedHours = 0

              startsAt = this.createDateInTimezone(year, month, day, parsedHours, parsedMinutes)
              console.log(`[${this.config.name}] Updated time for "${title}": ${parsedHours}:${parsedMinutes.toString().padStart(2, '0')}`)
              foundTime = true
              return
            }

            // Fall back to door time
            const doorMatch = text.match(/doors?:?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
            if (doorMatch) {
              let parsedHours = parseInt(doorMatch[1] ?? '0', 10)
              const parsedMinutes = doorMatch[2] ? parseInt(doorMatch[2], 10) : 0
              const ampm = (doorMatch[3] ?? 'pm').toLowerCase()

              if (ampm === 'pm' && parsedHours < 12) parsedHours += 12
              if (ampm === 'am' && parsedHours === 12) parsedHours = 0

              startsAt = this.createDateInTimezone(year, month, day, parsedHours, parsedMinutes)
              console.log(`[${this.config.name}] Updated time for "${title}" (doors): ${parsedHours}:${parsedMinutes.toString().padStart(2, '0')}`)
              foundTime = true
            }
          })

          // Try to find description in common locations
          // Marigold uses h3 tags for content, not p tags
          // Always try to get a better description from the page (gallery descriptions are often truncated)
          {
            const selectors = [
              '.entry-content h3',
              '.entry-content p',
              '.event-description',
              '.wp-block-group p',
              'article h3',
              'article p',
              'main p'
            ]

            const descriptionParts: string[] = []

            for (const selector of selectors) {
              const elements = $(selector)
              for (let i = 0; i < elements.length; i++) {
                const text = $(elements[i]).text().trim()
                // Stop if we hit footer/venue info
                if (text.match(/^Marigold Theater|^84 Cottage|^157 Main|^\(413\)|^\(802\)|^Email:|^Booking:|^facebook\.com|^instagram\.com/i)) {
                  break
                }
                // Skip very short text, date-only text, metadata lines, or empty paragraphs
                if (text.length > 30 &&
                    !text.match(/^(🗓️|📍|🍸|☕|🎶|🎟️|&nbsp;|https?:\/\/)/) &&
                    text !== '&nbsp;' &&
                    !text.match(/^(Doors|Music|Bar Open|FREE SHOW|Photo:)/i)) {
                  descriptionParts.push(text)
                }
              }
              if (descriptionParts.length > 0) break
            }

            // If still no description, try to get all paragraph text
            if (descriptionParts.length === 0) {
              $('p').each((_, el) => {
                const text = $(el).text().trim()
                if (text.length > 30 && !text.match(/^(🗓️|📍|🍸|☕|🎶|🎟️)/)) {
                  descriptionParts.push(text)
                }
              })
            }

            if (descriptionParts.length > 0) {
              finalDescription = descriptionParts.join(' ').substring(0, 2000) // Limit to 2000 chars
            }
          }
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        console.log(`[${this.config.name}] Could not fetch from ${galleryEvent.href}:`, error)
        // Continue without extra info
      }

      // Skip cancelled/postponed events
      if (isCancelled) {
        console.log(`[${this.config.name}] Skipping cancelled/postponed event: "${title}"`)
        return null
      }

      // Ensure title is not undefined or empty
      if (!title || title.length < 2) {
        // Final fallback - use URL slug
        const urlMatch = galleryEvent.href.match(/\/([^/]+)\/?$/)
        if (urlMatch && urlMatch[1]) {
          title = urlMatch[1]
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        } else {
          title = cleanDateTitle || 'Event'
        }
      }

      return {
        title,
        description: finalDescription || undefined,
        imageUrl: galleryEvent.imageUrl,
        startsAt,
        sourceUrl,
        sourceEventId,
        coverCharge,
      }
      } catch (error) {
      console.error(`[${this.config.name}] Error parsing gallery event:`, error)
      return null
    }
  }

  // Scrape an individual event page for more details
  private async scrapeEventPage(url: string): Promise<ScrapedEvent | null> {
    if (!this.page) {
      // Fallback to HTTP if no page available
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })

      if (!response.ok) return null

      const html = await response.text()
      const $ = cheerio.load(html)
        return this.parseEventFromHtml($, url)
      } catch (error) {
        console.error(`[${this.config.name}] Error fetching ${url}:`, error)
        return null
      }
    }

    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 })
      await this.page.waitForTimeout(500) // Brief wait for content

      const html = await this.page.content()
      const $ = this.$(html)

      // Try LD+JSON first
      let eventData: ScrapedEvent | null = null

      $('script[type="application/ld+json"]').each((_, el) => {
        if (eventData) return

        try {
          const data = JSON.parse($(el).html() || '')
          const items = Array.isArray(data) ? data : [data]

          for (const item of items) {
            if (item['@type'] === 'Event' || item['@type'] === 'MusicEvent') {
              eventData = this.parseEventSchema(item, url)
              break
            }
          }
        } catch {
          // JSON parse failed
        }
      })

      // Fallback to HTML parsing
      if (!eventData) {
        eventData = this.parseEventFromHtml($, url)
        if (!eventData) {
          console.log(`[${this.config.name}] Could not parse event from ${url} - no date found`)
        }
      }

      return eventData
    } catch (error) {
      console.error(`[${this.config.name}] Error scraping ${url}:`, error)
      return null
    }
  }

  private parseEventSchema(data: Record<string, unknown>, sourceUrl?: string): ScrapedEvent | null {
    try {
      const title = data.name as string
      if (!title) return null

      const startDate = data.startDate as string
      if (!startDate) return null

      const startsAt = new Date(startDate)
      if (isNaN(startsAt.getTime())) return null

      // Skip past events (but allow today's events)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const eventDate = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate())
      if (eventDate < today) return null

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

      // Get URL
      const url = sourceUrl || (data.url as string) || this.config.url

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
      const sourceEventId = `marigold-${dateStr}-${titleSlug}`

      return {
        title,
        description: data.description as string | undefined,
        imageUrl,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        sourceUrl: url,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing event schema:`, error)
      return null
    }
  }

  private parseEventFromHtml($: cheerio.CheerioAPI, sourceUrl: string): ScrapedEvent | null {
    try {
      // Get title
      const title = $('h1.entry-title, h1.post-title, .event-title h1').first().text().trim() || $('h1').first().text().trim()

      if (!title) return null

      // Try to find date
      let startsAt: Date | null = null
      const dateSelectors = ['.event-date', '.post-date', 'time[datetime]', '.date', '.meta-date', 'p:contains("🗓️")', 'p:contains("November")', 'p:contains("December")']

      for (const selector of dateSelectors) {
        try {
        const el = $(selector).first()
        const datetime = el.attr('datetime') || el.text()
        if (datetime) {
          startsAt = new Date(datetime)
          if (!isNaN(startsAt.getTime())) break
          }
        } catch {
          // Selector might not be valid (e.g., :contains)
          continue
        }
      }
      
      // Also check all <p> tags for date patterns
      if (!startsAt || isNaN(startsAt.getTime())) {
        $('p').each((_, el) => {
          const text = $(el).text()
          if (text.includes('🗓️') || text.match(/November|December|January|February|March|April|May|June|July|August|September|October/i)) {
            const dateMatch = text.match(
              /(?:🗓️\s*)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i
            )
            if (dateMatch && !startsAt) {
              const monthMatch = text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)/i)
              if (monthMatch && monthMatch[0]) {
                const monthNames: Record<string, number> = {
                  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
                  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
                }
                const month = monthNames[monthMatch[0].toLowerCase()] ?? 0
                const day = parseInt(dateMatch[1] ?? '1', 10)
                const now = new Date()
                let year = dateMatch[2] ? parseInt(dateMatch[2], 10) : now.getFullYear()
                if (!dateMatch[2] && month < now.getMonth()) {
                  year++
                }
                let hours = 20
                let minutes = 0
                const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
                if (timeMatch) {
                  hours = parseInt(timeMatch[1] ?? '20', 10)
                  minutes = parseInt(timeMatch[2] ?? '0', 10)
                  const ampm = (timeMatch[3] ?? 'pm').toLowerCase()
                  if (ampm === 'pm' && hours < 12) hours += 12
                  if (ampm === 'am' && hours === 12) hours = 0
                }
                startsAt = this.createDateInTimezone(year, month, day, hours, minutes)
                return false // Break the loop
              }
            }
          }
        })
      }

      // Also try looking in the content for date patterns
      if (!startsAt || isNaN(startsAt.getTime())) {
        const content = $('body').text()
        
        // Match patterns like "🗓️ Saturday, November 22nd" or "Saturday, November 22nd"
        const dateMatch = content.match(
          /(?:🗓️\s*)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i
        )
        if (dateMatch) {
          const monthMatch = content.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)/i)
          if (monthMatch && monthMatch[0]) {
            const monthNames: Record<string, number> = {
              january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
              july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
            }
            const month = monthNames[monthMatch[0].toLowerCase()] ?? 0
            const day = parseInt(dateMatch[1] ?? '1', 10)
            const now = new Date()
            let year = dateMatch[2] ? parseInt(dateMatch[2], 10) : now.getFullYear()

            // If no year specified and month has passed, assume next year
            if (!dateMatch[2] && month < now.getMonth()) {
              year++
            }

            // Try to find time in content
            let hours = 20 // Default 8 PM
            let minutes = 0
            const timeMatch = content.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
            if (timeMatch) {
              hours = parseInt(timeMatch[1] ?? '20', 10)
              minutes = parseInt(timeMatch[2] ?? '0', 10)
              const ampm = (timeMatch[3] ?? 'pm').toLowerCase()
              if (ampm === 'pm' && hours < 12) hours += 12
              if (ampm === 'am' && hours === 12) hours = 0
            }

            // Default to 8 PM for evening events
            startsAt = this.createDateInTimezone(year, month, day, hours, minutes)
          }
        } else {
          // Try "December 15, 2025" format
          const fullDateMatch = content.match(
            /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i
          )
          if (fullDateMatch) {
            startsAt = new Date(fullDateMatch[0])
          }
        }
      }

      if (!startsAt || isNaN(startsAt.getTime())) {
        return null // Can't create event without date
      }

      // Skip past events (but allow today's events)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const eventDate = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate())
      if (eventDate < today) return null

      // Get description
      const description = $('.entry-content, .post-content, .event-description').first().text().trim().slice(0, 500) || undefined

      // Get image
      const imageUrl =
        $('img.wp-post-image, .featured-image img, .event-image img').first().attr('src') ||
        $('article img').first().attr('src') ||
        undefined

      // Get price
      const priceText = $('.ticket-price, .price, .admission').first().text()
      const priceMatch = priceText.match(/\$[\d,.]+/)
      const coverCharge = priceMatch ? priceMatch[0] : undefined

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      const sourceEventId = `marigold-${dateStr}-${titleSlug}`

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
