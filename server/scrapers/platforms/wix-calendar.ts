/**
 * Helper for scraping Wix/BoomTech FullCalendar widgets
 * Can be used by any venue that uses the Wix calendar widget
 */

import type { Frame, Page } from 'playwright'

export interface CalendarEvent {
  title: string
  date: string // YYYY-MM-DD format
  isMultiDay?: boolean
  details?: {
    time?: string
    description?: string
    price?: string
    url?: string
    image?: string
  }
}

export class WixCalendarScraper {
  /**
   * Scrape events from a Wix/BoomTech calendar iframe
   * @param page - Playwright page object
   * @param options - Scraping options
   */
  static async scrapeCalendar(
    page: Page,
    options: {
      /**
       * Number of months to navigate forward (default: 2)
       */
      monthsToScrape?: number
      /**
       * Whether to click on events to get additional details (default: false)
       */
      extractDetails?: boolean
      /**
       * Timeout for waiting for calendar to load (default: 15000)
       */
      timeout?: number
    } = {}
  ): Promise<CalendarEvent[]> {
    const {
      monthsToScrape = 2,
      extractDetails = false,
      timeout = 15000,
    } = options

    // Find the calendar iframe
    const iframe = await this.findCalendarIframe(page, timeout)
    if (!iframe) {
      throw new Error('Calendar iframe not found')
    }

    const allEvents: CalendarEvent[] = []

    // Scrape current month and next N months
    for (let i = 0; i < monthsToScrape; i++) {
      const events = await this.extractMonthEvents(iframe, extractDetails)
      allEvents.push(...events)

      // Navigate to next month if not the last iteration
      if (i < monthsToScrape - 1) {
        await this.goToNextMonth(iframe)
        // Wait for calendar to update
        await iframe.waitForTimeout(1000)
      }
    }

    return this.deduplicateEvents(allEvents)
  }

  /**
   * Find the BoomTech/Wix calendar iframe
   */
  private static async findCalendarIframe(
    page: Page,
    timeout: number
  ): Promise<Frame | null> {
    try {
      // Wait for iframe to be present
      await page.waitForSelector('iframe[title="Calendar"], iframe[src*="boomte.ch"]', {
        timeout,
      })

      // Try multiple methods to find the iframe
      const frames = page.frames()

      // Method 1: Find by URL
      let iframe = frames.find(f => f.url().includes('boomte.ch'))

      // Method 2: Find by title
      if (!iframe) {
        const iframeElement = await page.$('iframe[title="Calendar"]')
        if (iframeElement) {
          iframe = await iframeElement.contentFrame() ?? undefined
        }
      }

      return iframe ?? null
    } catch (error) {
      console.error('Failed to find calendar iframe:', error)
      return null
    }
  }

  /**
   * Extract events from the current month view
   */
  private static async extractMonthEvents(
    frame: Frame,
    extractDetails: boolean
  ): Promise<CalendarEvent[]> {
    // Wait for calendar to be rendered
    await frame.waitForSelector('.fc-daygrid-day', { timeout: 10000 })

    // Extract events using evaluate
    const events = await frame.evaluate(() => {
      const eventElements = document.querySelectorAll('.fc-daygrid-event')
      const results: Array<{ title: string; date: string; isMultiDay: boolean }> = []

      eventElements.forEach(el => {
        // Get the parent cell to find the date
        const cell = el.closest('td[data-date]') as HTMLElement
        const date = cell?.getAttribute('data-date')

        // Get event title
        const titleEl = el.querySelector('.fc-event-title')
        const title = titleEl?.textContent?.trim()

        // Check if it's a multi-day event
        const isStart = el.classList.contains('fc-event-start')
        const isEnd = el.classList.contains('fc-event-end')
        const isMultiDay = isStart && !isEnd

        if (title && date) {
          results.push({
            title,
            date,
            isMultiDay,
          })
        }
      })

      return results
    })

    // Optionally extract additional details by clicking events
    if (extractDetails) {
      const detailedEvents = await this.extractEventDetails(frame, events)
      return detailedEvents
    }

    return events
  }

  /**
   * Click on events to extract additional details
   */
  private static async extractEventDetails(
    frame: Frame,
    events: CalendarEvent[]
  ): Promise<CalendarEvent[]> {
    const detailedEvents: CalendarEvent[] = []
    const page = frame.page()

    // Get all event elements
    const eventElements = await frame.$$('.fc-daygrid-event')

    for (let i = 0; i < Math.min(eventElements.length, events.length); i++) {
      const event = events[i]
      const element = eventElements[i]
      if (!event || !element) continue

      try {
        // Click on the event - use force option to bypass iframe overlays
        await element.click({ force: true, timeout: 5000 })

        // Wait for modal iframe to appear
        await page.waitForTimeout(1000)

        // Look for the modal iframe by URL pattern
        const modalFrame = page.frames().find(f => f.url().includes('event-modal'))

        if (modalFrame) {
          // Wait for modal content to load
          await modalFrame.waitForLoadState('load', { timeout: 5000 }).catch(() => {})
          await modalFrame.waitForTimeout(300)

          // Extract details from the modal iframe
          const details = await modalFrame.evaluate(() => {
            // Get time from the details section
            const timeElement = document.querySelector('.details p')
            const time = timeElement?.textContent?.trim()

            // Get description from the description section
            const descriptionElement = document.querySelector('.description.section p')
            const description = descriptionElement?.textContent?.trim()

            // Get address/location
            const addressElement = document.querySelector('.details.link span:last-child')
            const address = addressElement?.textContent?.trim()

            // Get image from event_image section
            const imageElement = document.querySelector('.event_image img')
            const image = imageElement ? (imageElement as { src?: string }).src : undefined

            return { time, description, address, image }
          })

          detailedEvents.push({
            ...event,
            details: {
              time: details.time,
              description: details.description,
              image: details.image,
            },
          })

          // Close modal - click the close button
          await modalFrame.click('.close_button img', { timeout: 3000 }).catch(async () => {
            // If close button fails, try escape key
            await page.keyboard.press('Escape')
          })

          // Wait for modal to close
          await page.waitForTimeout(500)
        } else {
          // No modal appeared, use basic event info
          console.warn(`No modal found for event: ${event.title}`)
          detailedEvents.push(event)
        }
      } catch (error) {
        // If clicking fails, just use the basic event info
        console.warn(`Failed to extract details for event: ${event.title}`, error)
        detailedEvents.push(event)
      }
    }

    return detailedEvents
  }

  /**
   * Navigate to next month in the calendar
   */
  private static async goToNextMonth(frame: Frame): Promise<void> {
    try {
      // Click the next button in the calendar
      await frame.click('.fc-next-button', { timeout: 5000 })
      console.log('Navigated to next month')
    } catch (error) {
      console.error('Failed to navigate to next month:', error)
      throw new Error('Next button not found in calendar')
    }
  }

  /**
   * Navigate to previous month in the calendar
   */
  private static async goToPrevMonth(frame: Frame): Promise<void> {
    const prevButton = await frame.$('.fc-prev-button')
    if (!prevButton) {
      throw new Error('Previous button not found in calendar')
    }

    await prevButton.click()
  }

  /**
   * Remove duplicate events (handles multi-day events)
   */
  private static deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
    const eventMap = new Map<string, CalendarEvent & { dates: string[] }>()

    for (const event of events) {
      const key = event.title.toLowerCase().trim()

      if (eventMap.has(key)) {
        // Add this date to the existing event
        const existing = eventMap.get(key)!
        existing.dates.push(event.date)
      } else {
        // Create new entry
        eventMap.set(key, {
          ...event,
          dates: [event.date],
        })
      }
    }

    // Convert back to CalendarEvent array
    return Array.from(eventMap.values()).map(({ dates, ...event }) => ({
      ...event,
      date: dates.sort()[0] ?? '', // Use earliest date as the start date
      isMultiDay: dates.length > 1,
    })) as CalendarEvent[]
  }
}
