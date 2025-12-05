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

interface LdJsonEvent {
  '@type': string
  name?: string
  startDate?: string
  endDate?: string
  url?: string
  location?: { name?: string }
  image?: string | string[]
  description?: string
  offers?: { price?: string; priceCurrency?: string; url?: string }
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
  schedule: '0 6 * * *',
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'ALL_AGES', // Theater venue
}

export class MarigoldScraper extends PlaywrightScraper {
  constructor() {
    super(marigoldConfig)
  }

  protected async waitForContent(): Promise<void> {
    if (!this.page) return

    // Wait for WonderPlugin Grid Gallery to load (JS-rendered)
    try {
      await this.page.waitForSelector('.wonderplugin-gridgallery-item, .wonderplugin-gridgallery-list', {
        timeout: 10000,
      })
      // Wait a bit more for gallery to fully initialize
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
    await this.page.waitForSelector('.wonderplugin-gridgallery-item', { timeout: 10000 })
    
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
            category,
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
    
    // Also extract from LD+JSON on main page
    const ldJsonEvents = await this.page.evaluate((): LdJsonEvent[] => {
      const events: LdJsonEvent[] = []
      const scripts = document.querySelectorAll('script[type="application/ld+json"]')
      scripts.forEach((script) => {
        try {
          const data = JSON.parse(script.textContent || '')
        const items = Array.isArray(data) ? data : [data]
          items.forEach((item: LdJsonEvent) => {
          if (item['@type'] === 'Event' || item['@type'] === 'MusicEvent') {
              events.push(item)
          }
          })
      } catch {
        // JSON parse failed
      }
      })
      return events
    })

    for (const item of ldJsonEvents) {
      const event = this.parseEventSchema(item)
        if (event) {
          // Check for duplicates
          const isDupe = events.some(
            (e) => e.sourceEventId === event.sourceEventId || (e.title === event.title && e.startsAt.getTime() === event.startsAt.getTime())
          )
          if (!isDupe) {
            events.push(event)
          }
        }
    }

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
      const monthStr = dateMatch[1].toLowerCase().slice(0, 3)
      const month = monthNames[monthStr]
      if (month === undefined) {
        console.log(`[${this.config.name}] Invalid month: ${monthStr}`)
        return null
      }
      
      const day = parseInt(dateMatch[2], 10)
      if (isNaN(day) || day < 1 || day > 31) {
        console.log(`[${this.config.name}] Invalid day: ${dateMatch[2]}`)
        return null
      }
      
      // Try to extract year from multiple sources
      let year: number | null = null
      
      // 1. Check description for year (2024, 2025, 2026, etc.)
      const descriptionText = galleryEvent.description.replace(/<[^>]+>/g, ' ')
      const yearMatch = descriptionText.match(/\b(20[2-9]\d)\b/)
      if (yearMatch) {
        const foundYear = parseInt(yearMatch[1], 10)
        // Validate: year should be reasonable (2020-2030)
        if (foundYear >= 2020 && foundYear <= 2030) {
          year = foundYear
        }
      }
      
      // 2. Check image URL for year (e.g., /2025/09/ in upload path)
      if (!year && galleryEvent.imageUrl) {
        const imageYearMatch = galleryEvent.imageUrl.match(/\/(\d{4})\//)
        if (imageYearMatch) {
          const foundYear = parseInt(imageYearMatch[1], 10)
          // Validate: year should be reasonable (2020-2030)
          if (foundYear >= 2020 && foundYear <= 2030) {
            year = foundYear
          }
        }
      }
      
      // 3. If we have the event URL, we could visit it to get the year from the page
      // But we're avoiding that due to rate limiting. The image URL year is usually reliable.
      
      // If no year found, use current year and apply logic
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth()
      const currentDay = now.getDate()
      
      if (!year) {
        year = currentYear
        
        // If month/day has already passed this year, it's likely a past event this year
        // Only assume next year if we're in late December/early January and the date
        // would be more than 3 months in the past
        if (month < currentMonth || (month === currentMonth && day < currentDay)) {
          // Check how far in the past this would be if it's this year
          const testDateThisYear = this.createDateInTimezone(currentYear, month, day, 20, 0)
          const daysAgo = (now.getTime() - testDateThisYear.getTime()) / (1000 * 60 * 60 * 24)
          
          // If it's more than 90 days (3 months) in the past, and we're in late year,
          // it might be next year. But for most cases, it's a past event this year.
          // Only assume next year if we're in November/December and the date is >90 days ago
          if (daysAgo > 90 && currentMonth >= 10) {
            year = currentYear + 1
          }
          // Otherwise, it's a past event this year (will be filtered out below)
        }
      }
      
      // Create test date to validate
      const testDate = this.createDateInTimezone(year, month, day, 20, 0)
      const monthsAway = (testDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
      
      // If the date is more than 14 months away, something is wrong
      // Revert to current year (will be filtered as past)
      if (monthsAway > 14) {
        year = currentYear
      }

      // Default to 8 PM for evening events
      const startsAt = this.createDateInTimezone(year, month, day, 20, 0)

      // Skip past events (but allow today's events)
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const eventDate = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate())
      if (eventDate < today) {
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
        if (urlMatch) {
          title = urlMatch[1]
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        } else {
          title = cleanDateTitle // Fallback to date if no description
        }
      } else {
        // Clean up description - take first line or first 100 chars for title
        title = title.split('\n')[0].split('|')[0].trim().slice(0, 100)
      }
      
      // If description is empty or very short, we'll need to fetch it from the event page
      // But for now, keep what we have (might be empty)
      if (!description || description.length < 10) {
        description = undefined
      }

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50)
      const sourceEventId = `marigold-${dateStr}-${titleSlug}`

      // Normalize URL
      const sourceUrl = galleryEvent.href.startsWith('http') 
        ? galleryEvent.href 
        : `https://marigold.org${galleryEvent.href}`

      // If description is missing, try to fetch it from the event page using HTTP
      let finalDescription = description
      if (!finalDescription) {
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
            
            // Try to find title in h2 (often the event title)
            const h2Title = $('h2').first().text().trim()
            if (h2Title && h2Title.length > 5 && (!title || title.length < 5)) {
              title = h2Title
            }
            
            // Try to find description in common locations
            const selectors = [
              '.entry-content p',
              '.event-description',
              '.wp-block-group p',
              'article p',
              'main p'
            ]
            
            const descriptionParts: string[] = []
            
            for (const selector of selectors) {
              const elements = $(selector)
              for (let i = 0; i < elements.length; i++) {
                const text = $(elements[i]).text().trim()
                // Skip very short text, date-only text, or empty paragraphs
                if (text.length > 50 && !text.match(/^(🗓️|📍|🍸|☕|&nbsp;)/) && text !== '&nbsp;') {
                  descriptionParts.push(text)
                }
              }
              if (descriptionParts.length > 0) break
            }
            
            // If still no description, try to get all paragraph text
            if (descriptionParts.length === 0) {
              $('p').each((_, el) => {
                const text = $(el).text().trim()
                if (text.length > 50 && !text.match(/^(🗓️|📍|🍸|☕)/)) {
                  descriptionParts.push(text)
                }
              })
            }
            
            if (descriptionParts.length > 0) {
              finalDescription = descriptionParts.join(' ').substring(0, 1000) // Limit to 1000 chars
            }
          }
          
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (error) {
          console.log(`[${this.config.name}] Could not fetch description from ${galleryEvent.href}:`, error)
          // Continue without description
        }
      }

      // Ensure title is not undefined or empty
      if (!title || title.length < 2) {
        // Final fallback - use URL slug
        const urlMatch = galleryEvent.href.match(/\/([^/]+)\/?$/)
        if (urlMatch) {
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
              if (monthMatch) {
                const monthNames: Record<string, number> = {
                  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
                  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
                }
                const month = monthNames[monthMatch[0].toLowerCase()]
                const day = parseInt(dateMatch[1], 10)
                const now = new Date()
                let year = dateMatch[2] ? parseInt(dateMatch[2], 10) : now.getFullYear()
                if (!dateMatch[2] && month < now.getMonth()) {
                  year++
                }
                let hours = 20
                let minutes = 0
                const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
                if (timeMatch) {
                  hours = parseInt(timeMatch[1], 10)
                  minutes = parseInt(timeMatch[2], 10)
                  const ampm = timeMatch[3].toLowerCase()
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
          if (monthMatch) {
            const monthNames: Record<string, number> = {
              january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
              july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
            }
            const month = monthNames[monthMatch[0].toLowerCase()]
            const day = parseInt(dateMatch[1], 10)
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
              hours = parseInt(timeMatch[1], 10)
              minutes = parseInt(timeMatch[2], 10)
              const ampm = timeMatch[3].toLowerCase()
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
