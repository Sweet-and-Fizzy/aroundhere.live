import { PlaywrightScraper } from '../base'
import { WixCalendarScraper } from '../platforms/wix-calendar'
import type { ScrapedEvent } from '../types'
import { fromZonedTime } from 'date-fns-tz'

export class FameScraper extends PlaywrightScraper {
  constructor() {
    super({
      id: 'fame',
      name: 'Fame (Holyoke)',
      venueSlug: 'fame',
      url: 'https://www.fameholyoke.com/about-5',
      enabled: true,
      category: 'VENUE',
      priority: 10,
      timezone: 'America/New_York',
    })
  }

  // Override to use custom navigation strategy for Wix
  override async scrape() {
    const startTime = Date.now()
    const errors: string[] = []
    let events: ScrapedEvent[] = []

    try {
      await this.initialize()

      if (!this.page) {
        throw new Error('Page not initialized')
      }

      // Navigate with more lenient settings for Wix sites
      console.log('Navigating to Fame calendar page...')
      await this.page.goto(this.config.url, {
        waitUntil: 'domcontentloaded', // Don't wait for networkidle (Wix has lots of background requests)
        timeout: 45000,
      })

      // Wait for the page to be stable
      await this.page.waitForLoadState('load')
      console.log('Page loaded, waiting for calendar iframe...')
      await this.page.waitForTimeout(4000) // Give iframe time to load

      // Use the WixCalendarScraper helper
      const calendarEvents = await WixCalendarScraper.scrapeCalendar(this.page, {
        monthsToScrape: 3, // Get 3 months of events
        extractDetails: true, // Extract details from modal iframes
        timeout: 20000,
      })

      console.log(`Found ${calendarEvents.length} events on Fame calendar`)

      // Convert calendar events to ScrapedEvent format
      events = calendarEvents.map(event => {
        // Parse the date - default to 8 PM if no specific time
        let startsAt: Date

        if (event.details?.time) {
          // Try to parse the time from details
          startsAt = this.parseDateTime(event.date, event.details.time)
        } else {
          // Default to 8 PM
          startsAt = fromZonedTime(
            new Date(event.date + 'T20:00:00'),
            this.config.timezone
          )
        }

        const scrapedEvent: ScrapedEvent = {
          title: event.title,
          startsAt,
          sourceUrl: this.config.url,
          sourceEventId: `${event.date}-${event.title.toLowerCase().replace(/\s+/g, '-')}`,
        }

        // Add optional fields if available
        if (event.details?.description) {
          scrapedEvent.description = event.details.description
        }

        if (event.details?.price) {
          scrapedEvent.coverCharge = event.details.price
        }

        if (event.details?.url) {
          scrapedEvent.ticketUrl = event.details.url
        }

        if (event.details?.image) {
          scrapedEvent.imageUrl = event.details.image
        }

        // Set end date for multi-day events
        if (event.isMultiDay) {
          // End at midnight the next day
          const endDate = new Date(startsAt)
          endDate.setDate(endDate.getDate() + 1)
          endDate.setHours(23, 59, 59, 999)
          scrapedEvent.endsAt = endDate
        }

        return scrapedEvent
      })

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

  // Required by base class but not used since we override scrape()
  protected async parseEvents(_html: string): Promise<ScrapedEvent[]> {
    return []
  }

  /**
   * Parse date and time string into a Date object
   * @param dateStr - ISO date string (YYYY-MM-DD)
   * @param timeStr - Time string like "Saturday, 13 December  11:00 pm" or "Saturday, 13 December"
   */
  private parseDateTime(dateStr: string, timeStr: string): Date {
    // Extract time from the string (e.g., "11:00 pm", "7:00 pm")
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)

    if (timeMatch) {
      let hour = parseInt(timeMatch[1] ?? '20', 10)
      const minute = parseInt(timeMatch[2] ?? '0', 10)
      const meridiem = (timeMatch[3] ?? 'pm').toLowerCase()

      // Convert to 24-hour format
      if (meridiem === 'pm' && hour < 12) {
        hour += 12
      } else if (meridiem === 'am' && hour === 12) {
        hour = 0
      }

      const dateTime = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`)
      return fromZonedTime(dateTime, this.config.timezone)
    }

    // No time found - default to 8 PM
    return fromZonedTime(
      new Date(dateStr + 'T20:00:00'),
      this.config.timezone
    )
  }

  override async waitForContent(): Promise<void> {
    // Not used - we handle navigation in parseEvents
  }
}
