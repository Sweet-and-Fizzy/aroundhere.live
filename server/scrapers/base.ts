import { chromium, type Browser, type Page } from 'playwright'
import * as cheerio from 'cheerio'
import { fromZonedTime } from 'date-fns-tz'
import type { ScraperConfig, ScraperResult, ScrapedEvent, BaseScraper } from './types'

export abstract class PlaywrightScraper implements BaseScraper {
  config: ScraperConfig
  protected browser: Browser | null = null
  protected page: Page | null = null

  constructor(config: ScraperConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      // Required for Docker environments - container provides isolation
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    // Create context with identifiable user agent
    // We identify ourselves so site owners can contact us if needed
    const context = await this.browser.newContext({
      userAgent: 'AroundHereBot/1.0 (+https://aroundhere.live; whatsup@aroundhere.live) Chrome/120.0.0.0',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
    })

    this.page = await context.newPage()

    // Set reasonable timeout
    this.page.setDefaultTimeout(30000)
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close()
      this.page = null
    }
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  async scrape(): Promise<ScraperResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let events: ScrapedEvent[] = []

    try {
      await this.initialize()

      if (!this.page) {
        throw new Error('Page not initialized')
      }

      // Allow subclasses to set up listeners before navigation
      await this.beforeNavigate()

      // Navigate to the page
      await this.page.goto(this.config.url, {
        waitUntil: this.getWaitUntilStrategy(),
      })

      // Wait for content to load (subclasses can override)
      await this.waitForContent()

      // Handle infinite scroll sites
      if (this.supportsInfiniteScroll()) {
        events = await this.handleInfiniteScroll()
      } else {
        // Get page content
        const html = await this.page.content()

        // Parse events (implemented by subclasses)
        events = await this.parseEvents(html)
      }

      // Handle click-based pagination if supported
      if (this.supportsPagination() && !this.supportsInfiniteScroll()) {
        let pageNum = 1
        const maxPages = this.getMaxPages()

        while (pageNum < maxPages) {
          const hasMore = await this.loadNextPage()
          if (!hasMore) break

          pageNum++
          await this.waitForContent()

          const pageHtml = await this.page.content()
          const pageEvents = await this.parseEvents(pageHtml)

          if (pageEvents.length === 0) break

          // Filter out duplicates from same scrape session
          const newEvents = pageEvents.filter(
            pe => !events.some(e => e.sourceEventId === pe.sourceEventId)
          )
          events.push(...newEvents)

          console.log(`[${this.config.name}] Page ${pageNum}: found ${pageEvents.length} events (${newEvents.length} new)`)
        }
      }

      console.log(`[${this.config.name}] Scraped ${events.length} events total`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push(message)
      console.error(`[${this.config.name}] Scrape error:`, message)
    } finally {
      await this.cleanup()
    }

    return {
      success: errors.length === 0,
      events,
      errors,
      scrapedAt: new Date(),
      duration: Date.now() - startTime,
    }
  }

  // Override in subclass to set up response listeners before navigation
  protected async beforeNavigate(): Promise<void> {
    // Default: no-op
  }

  // Override in subclass to change the page.goto waitUntil strategy
  // 'networkidle' is safest but can timeout on sites with persistent connections
  // 'domcontentloaded' is faster but may miss dynamically loaded content
  protected getWaitUntilStrategy(): 'networkidle' | 'domcontentloaded' | 'load' | 'commit' {
    return 'networkidle'
  }

  // Override in subclass to wait for specific content
  protected async waitForContent(): Promise<void> {
    // Default: wait a bit for dynamic content
    await this.page?.waitForTimeout(2000)
  }

  // Override to enable pagination (click-based or infinite scroll)
  protected supportsPagination(): boolean {
    return false
  }

  // Override to enable infinite scroll handling
  protected supportsInfiniteScroll(): boolean {
    return false
  }

  // Override to set max pages/scrolls
  protected getMaxPages(): number {
    return 10
  }

  // Override to implement click-based pagination logic
  // Return true if there's a next page, false if no more pages
  protected async loadNextPage(): Promise<boolean> {
    if (!this.page) return false

    // Common pagination patterns - subclasses should override for site-specific logic
    const nextSelectors = [
      '.pagination .next:not(.disabled)',
      '.pagination-next:not(.disabled)',
      '[aria-label="Next page"]',
      '.load-more',
      'button:has-text("Load More")',
      'a:has-text("Next")',
    ]

    for (const selector of nextSelectors) {
      try {
        const nextButton = await this.page.$(selector)
        if (nextButton && await nextButton.isVisible()) {
          await nextButton.click()
          await this.page.waitForLoadState('networkidle')
          return true
        }
      } catch {
        // Try next selector
      }
    }

    return false
  }

  // Handle infinite scroll - scroll down and wait for new content
  protected async handleInfiniteScroll(): Promise<ScrapedEvent[]> {
    if (!this.page) return []

    const allEvents: ScrapedEvent[] = []
    const seenEventIds = new Set<string>()
    let scrollAttempts = 0
    const maxScrolls = this.getMaxPages()
    let noNewContentCount = 0

    // Get initial events
    const initialHtml = await this.page.content()
    const initialEvents = await this.parseEvents(initialHtml)
    for (const event of initialEvents) {
      const id = event.sourceEventId || `${event.title}-${event.startsAt.toISOString()}`
      if (!seenEventIds.has(id)) {
        seenEventIds.add(id)
        allEvents.push(event)
      }
    }

    console.log(`[${this.config.name}] Initial load: ${allEvents.length} events`)

    while (scrollAttempts < maxScrolls && noNewContentCount < 3) {
      // Scroll to bottom
      const previousHeight = await this.page.evaluate(() => document.body.scrollHeight)
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

      // Wait for potential new content
      await this.page.waitForTimeout(2000)

      // Check if page height changed (new content loaded)
      const newHeight = await this.page.evaluate(() => document.body.scrollHeight)

      if (newHeight === previousHeight) {
        noNewContentCount++
        console.log(`[${this.config.name}] No new content after scroll (attempt ${noNewContentCount}/3)`)
      } else {
        noNewContentCount = 0

        // Parse new events
        const html = await this.page.content()
        const events = await this.parseEvents(html)

        let newCount = 0
        for (const event of events) {
          const id = event.sourceEventId || `${event.title}-${event.startsAt.toISOString()}`
          if (!seenEventIds.has(id)) {
            seenEventIds.add(id)
            allEvents.push(event)
            newCount++
          }
        }

        if (newCount > 0) {
          console.log(`[${this.config.name}] Scroll ${scrollAttempts + 1}: found ${newCount} new events (${allEvents.length} total)`)
        }
      }

      scrollAttempts++
    }

    return allEvents
  }

  // Abstract method - must be implemented by subclasses
  protected abstract parseEvents(html: string): Promise<ScrapedEvent[]>

  // Helper to parse with Cheerio
  protected $(html: string): cheerio.CheerioAPI {
    return cheerio.load(html)
  }

  // Helper to parse date strings
  protected parseDate(dateStr: string, timeStr?: string): Date | null {
    try {
      // Try various date formats
      const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr

      // Handle common formats
      const date = new Date(combined)
      if (!isNaN(date.getTime())) {
        return date
      }

      // Try parsing "Nov 22" style dates (assume current/next year)
      const monthDayMatch = dateStr.match(/(\w+)\s+(\d+)/i)
      if (monthDayMatch) {
        const months: Record<string, number> = {
          jan: 0, january: 0,
          feb: 1, february: 1,
          mar: 2, march: 2,
          apr: 3, april: 3,
          may: 4,
          jun: 5, june: 5,
          jul: 6, july: 6,
          aug: 7, august: 7,
          sep: 8, september: 8,
          oct: 9, october: 9,
          nov: 10, november: 10,
          dec: 11, december: 11,
        }

        const monthStr = monthDayMatch[1]
        const dayStr = monthDayMatch[2]
        if (!monthStr || !dayStr) return null

        const month = months[monthStr.toLowerCase()]
        const day = parseInt(dayStr)

        if (month !== undefined && day) {
          const now = new Date()
          let year = now.getFullYear()

          // If the date has passed this year, use next year
          const testDate = new Date(year, month, day)
          if (testDate < now) {
            year++
          }

          const result = new Date(year, month, day)

          // Parse time if provided
          if (timeStr) {
            const timeMatch = timeStr.match(/(\d+):(\d+)\s*(am|pm)?/i)
            if (timeMatch && timeMatch[1] && timeMatch[2]) {
              let hours = parseInt(timeMatch[1])
              const minutes = parseInt(timeMatch[2])
              const ampm = timeMatch[3]?.toLowerCase()

              if (ampm === 'pm' && hours < 12) hours += 12
              if (ampm === 'am' && hours === 12) hours = 0

              result.setHours(hours, minutes, 0, 0)
            }
          }

          return result
        }
      }

      return null
    } catch {
      return null
    }
  }

  // Helper to clean text
  protected cleanText(text: string | undefined): string {
    if (!text) return ''
    return text.replace(/\s+/g, ' ').trim()
  }

  /**
   * Convert a local date/time to UTC based on the scraper's configured timezone.
   * Use this when you've parsed a date that represents local venue time.
   *
   * @param localDate - Date object representing the local time at the venue
   * @returns Date object in UTC
   */
  protected toUTC(localDate: Date): Date {
    return fromZonedTime(localDate, this.config.timezone)
  }

  /**
   * Create a UTC date from date components in the venue's local timezone.
   * This is the preferred method for creating dates from scraped data.
   *
   * @param year - Full year (e.g., 2025)
   * @param month - Month (0-11, where 0 = January)
   * @param day - Day of month (1-31)
   * @param hours - Hours (0-23), defaults to 20 (8 PM)
   * @param minutes - Minutes (0-59), defaults to 0
   * @returns Date object in UTC
   */
  protected createDateInTimezone(
    year: number,
    month: number,
    day: number,
    hours: number = 20,
    minutes: number = 0
  ): Date {
    // Create an ISO-like string representing the local time
    const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
    return fromZonedTime(localDateStr, this.config.timezone)
  }

  // Helper to parse price
  protected parsePrice(text: string | undefined): string | undefined {
    if (!text) return undefined
    const cleaned = this.cleanText(text)

    // Look for price patterns - use word boundaries to avoid matching "free" in other words
    // Match "free", "free admission", "free entry", "free show", etc. but not "gluten-free"
    if (/\bfree\s*(admission|entry|show|event|concert)?\b/i.test(cleaned)) return 'Free'
    if (/\b(donation|pay what you can|pwyc|sliding scale)\b/i.test(cleaned)) return 'Donation'

    const priceMatch = cleaned.match(/\$[\d,]+(?:\.\d{2})?(?:\s*-\s*\$[\d,]+(?:\.\d{2})?)?/)
    return priceMatch ? priceMatch[0] : undefined
  }
}

// Simple HTTP scraper for static sites (faster, no browser needed)
export abstract class HttpScraper implements BaseScraper {
  config: ScraperConfig

  constructor(config: ScraperConfig) {
    this.config = config
  }

  async scrape(): Promise<ScraperResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let events: ScrapedEvent[] = []

    try {
      const response = await fetch(this.config.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      events = await this.parseEvents(html)

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

  protected abstract parseEvents(html: string): Promise<ScrapedEvent[]>

  protected $(html: string): cheerio.CheerioAPI {
    return cheerio.load(html)
  }
}
