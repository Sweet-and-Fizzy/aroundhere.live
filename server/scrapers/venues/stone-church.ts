import { PlaywrightScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'

/**
 * Scraper for Stone Church - VenuePilot widget
 *
 * Stone Church uses VenuePilot, a JS-rendered widget for event listings.
 * IMPORTANT: VenuePilot shows events from multiple venues. We must filter
 * to only include events actually at Stone Church.
 *
 * The widget renders event rows, and clicking opens a modal with rich data:
 * - .vp-presented-by-text: The actual venue name (filter on this!)
 * - .vp-event-name: Main headliner/event name
 * - .vp-event-support: Supporting acts/subtitle
 * - .vp-event-description: Full description text
 * - .vp-age-info: Age restriction
 * - .vp-show-time / .vp-door-time: Times
 * - .vp-btn-tickets: Tickets button with actual URL
 * - .vp-cover-img / .vp-main-img: Event image
 */

export const stoneChurchConfig: ScraperConfig = {
  id: 'stone-church',
  name: 'Stone Church',
  venueSlug: 'stone-church',
  url: 'https://stonechurchvt.com/events',
  enabled: true,
  schedule: '0 6 * * *',
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York', // Brattleboro, VT
  defaultAgeRestriction: 'ALL_AGES', // Music venue - varies by show
}

export class StoneChurchScraper extends PlaywrightScraper {
  constructor() {
    super(stoneChurchConfig)
  }

  protected async waitForContent(): Promise<void> {
    if (!this.page) return

    // Wait for VenuePilot widget to load
    try {
      await this.page.waitForSelector('.vp-event-list-wrapper, .vp-event-row', {
        timeout: 15000,
      })
      // Give VenuePilot time to fully render all events
      await this.page.waitForTimeout(3000)

      // Dismiss the Hive mailing list popup if it appears
      await this.dismissHivePopup()
    } catch {
      // If VenuePilot doesn't load, wait for general content
      await this.page.waitForTimeout(5000)
    }
  }

  private async dismissHivePopup(): Promise<void> {
    if (!this.page) return

    try {
      // Wait a bit for popup to appear (it has a 2-second delay)
      await this.page.waitForTimeout(2500)

      // Try to find and remove the Hive popup overlay
      await this.page.evaluate(() => {
        const popup = document.querySelector('.hive-popup-background')
        if (popup) {
          popup.remove()
          console.log('Removed Hive popup')
        }
        // Also remove any backdrop/overlay
        const overlays = document.querySelectorAll('[class*="hive"]')
        overlays.forEach(el => {
          if (el.classList.contains('hive-popup-background') ||
              el.getAttribute('data-hive-popup-form-id')) {
            el.remove()
          }
        })
      })

      console.log(`[${this.config.name}] Dismissed Hive mailing list popup`)
    } catch {
      // Popup might not exist, that's fine
    }
  }

  private async closeVenuePilotModal(): Promise<void> {
    if (!this.page) return

    try {
      // Try clicking the close button first (preserves VenuePilot's internal state)
      const closeClicked = await this.page.evaluate(() => {
        // Look for common close button selectors
        const closeSelectors = [
          '.vp-close-btn',
          '.vp-modal-close',
          '.vp-btn-close',
          '[aria-label="Close"]',
          '.close-button',
          'button.close',
        ]
        for (const selector of closeSelectors) {
          const btn = document.querySelector(selector) as HTMLElement
          if (btn) {
            btn.click()
            return true
          }
        }
        return false
      })

      if (closeClicked) {
        // Wait for modal to close naturally
        await this.page.waitForTimeout(500)
      } else {
        // No close button found, try pressing Escape
        await this.page.keyboard.press('Escape')
        await this.page.waitForTimeout(500)
      }

      // Wait for modal to be gone (without force removing)
      try {
        await this.page.waitForSelector('.vp-event-details-modal', {
          state: 'hidden',
          timeout: 2000,
        })
      } catch {
        // Modal might still be there, try clicking backdrop to close
        await this.page.evaluate(() => {
          const backdrop = document.querySelector('.vp-modal-backdrop, .vp-overlay') as HTMLElement
          if (backdrop) backdrop.click()
        })
        await this.page.waitForTimeout(500)
      }
    } catch {
      // Ignore errors - modal might not exist
    }
  }

  protected async parseEvents(_html: string): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = []

    if (!this.page) return events

    // First, collect all event IDs and basic info from the list page
    const eventRows = await this.page.evaluate(() => {
      const rows = document.querySelectorAll('.vp-event-row')
      return Array.from(rows).map(row => {
        const monthDay = row.querySelector('.vp-month-n-day')?.textContent?.trim() || ''
        const time = row.querySelector('.vp-time')?.textContent?.trim() || ''
        const eventLink = row.querySelector('a.vp-event-link') as HTMLAnchorElement
        const href = eventLink?.getAttribute('href') || ''
        const eventIdMatch = href.match(/#\/events\/(\d+)/)
        const eventId = eventIdMatch ? eventIdMatch[1] : null
        return { monthDay, time, eventId }
      })
    })

    console.log(`[${this.config.name}] Found ${eventRows.length} VenuePilot event rows`)

    // Process each event by changing the hash to trigger VenuePilot's modal
    for (let i = 0; i < eventRows.length; i++) {
      const rowData = eventRows[i]

      if (!rowData.eventId) {
        console.log(`[${this.config.name}] Event ${i + 1} has no event ID, skipping`)
        continue
      }

      try {
        // Use JavaScript to change the hash - this triggers VenuePilot's router
        await this.page.evaluate((eventId: string) => {
          window.location.hash = `/events/${eventId}`
        }, rowData.eventId)
        await this.page.waitForTimeout(1500)

        // Wait for modal to appear
        try {
          await this.page.waitForSelector('.vp-event-details-modal, .vp-event-listing', {
            timeout: 10000,
          })
        } catch {
          console.log(`[${this.config.name}] Modal didn't open for event ${i + 1} (ID: ${rowData.eventId})`)
          // Clear hash and continue
          await this.page.evaluate(() => { window.location.hash = '' })
          await this.page.waitForTimeout(500)
          continue
        }

        // Extract data from the modal
        const modalData = await this.page.evaluate(() => {
          const modal = document.querySelector('.vp-event-details-modal, .vp-event-listing')
          if (!modal) return null

          // Get venue name - CRITICAL for filtering
          // Note: .vp-presented-by-text contains presenter name, .vp-venue contains actual venue
          const venueName = modal.querySelector('.vp-venue')?.textContent?.trim() || ''

          // Get event details
          const eventName = modal.querySelector('.vp-event-name')?.textContent?.trim() || ''
          const support = modal.querySelector('.vp-event-support')?.textContent?.trim() || ''

          // Get description
          const descriptionEl = modal.querySelector('.vp-event-description')
          let description = ''
          if (descriptionEl) {
            // Get text content, preserving paragraph breaks
            const paragraphs = descriptionEl.querySelectorAll('p')
            if (paragraphs.length > 0) {
              description = Array.from(paragraphs)
                .map(p => p.textContent?.trim())
                .filter(Boolean)
                .join('\n\n')
            } else {
              description = descriptionEl.textContent?.trim() || ''
            }
          }

          // Get times
          const showTimeEl = modal.querySelector('.vp-show-time .vp-value')
          const doorTimeEl = modal.querySelector('.vp-door-time .vp-value')
          const showTime = showTimeEl?.textContent?.trim() || ''
          const doorTime = doorTimeEl?.textContent?.trim() || ''

          // Get date
          const dateEl = modal.querySelector('.vp-event-date .vp-value')
          const dateText = dateEl?.textContent?.trim() || ''

          // Get age restriction
          const ageText = modal.querySelector('.vp-age-text')?.textContent?.trim() || ''

          // Get image URL
          let imageUrl: string | null = null
          const coverImg = modal.querySelector('.vp-cover-img, .vp-main-img') as HTMLElement
          if (coverImg) {
            const bgStyle = coverImg.style.backgroundImage
            const urlMatch = bgStyle.match(/url\(['"]?([^'"()]+)['"]?\)/)
            if (urlMatch) {
              imageUrl = urlMatch[1]
            }
          }

          // Get ticket URL from button
          let ticketUrl: string | null = null
          const ticketBtn = modal.querySelector('.vp-btn-tickets') as HTMLButtonElement
          if (ticketBtn) {
            // The button might have an onclick or data attribute with the URL
            ticketUrl = ticketBtn.getAttribute('data-url') || null
          }

          // Get artists/lineup
          const artistNames: string[] = []
          modal.querySelectorAll('.vp-artist-row h2').forEach(h2 => {
            const name = h2.textContent?.trim()
            if (name) artistNames.push(name)
          })

          return {
            venueName,
            eventName,
            support,
            description,
            showTime,
            doorTime,
            dateText,
            ageText,
            imageUrl,
            ticketUrl,
            artistNames,
          }
        })

        // Close modal by clearing the hash
        await this.page.evaluate(() => { window.location.hash = '' })
        await this.page.waitForTimeout(500)

        if (!modalData) {
          console.log(`[${this.config.name}] Could not extract modal data for event ${i + 1}`)
          continue
        }

        // FILTER: Only include events at Stone Church
        // Must have a venue name and it must be Stone Church
        const venueLower = modalData.venueName.toLowerCase()
        const isStoneChurch = venueLower.includes('stone church') &&
                              !venueLower.includes('colonial') &&
                              !venueLower.includes('performing arts')
        if (!modalData.venueName || !isStoneChurch) {
          console.log(`[${this.config.name}] Skipping event at "${modalData.venueName}": ${modalData.eventName}`)
          continue
        }

        // Parse date from row data (format: "Nov 26")
        const monthMap: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        }

        const dateMatch = rowData.monthDay.match(/([A-Za-z]+)\s*(\d+)/i)
        if (!dateMatch) {
          console.log(`[${this.config.name}] Could not parse date: ${rowData.monthDay}`)
          continue
        }

        const monthStr = dateMatch[1].toLowerCase().slice(0, 3)
        const month = monthMap[monthStr]
        const day = parseInt(dateMatch[2], 10)
        if (month === undefined || isNaN(day)) {
          console.log(`[${this.config.name}] Invalid month/day: ${monthStr} ${day}`)
          continue
        }

        // Parse time (prefer show time from modal, fall back to row time)
        const timeStr = modalData.showTime || rowData.time
        const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
        if (!timeMatch) {
          console.log(`[${this.config.name}] Could not parse time: ${timeStr}`)
          continue
        }

        let hours = parseInt(timeMatch[1], 10)
        const minutes = parseInt(timeMatch[2], 10)
        const ampm = timeMatch[3].toUpperCase()
        if (ampm === 'PM' && hours < 12) hours += 12
        if (ampm === 'AM' && hours === 12) hours = 0

        // Determine year
        const now = new Date()
        const currentYear = now.getFullYear()
        let year = currentYear

        const testDate = this.createDateInTimezone(year, month, day, hours, minutes)
        if (testDate < now) {
          year++
        }

        const startsAt = this.createDateInTimezone(year, month, day, hours, minutes)

        // Skip if still in past
        if (startsAt < now) continue

        // Build title
        let title = modalData.eventName
        if (modalData.support && modalData.support !== title) {
          title = `${title} - ${modalData.support}`
        }

        // Build description
        let description = modalData.description || undefined
        if (!description && modalData.artistNames.length > 0) {
          description = `Lineup: ${modalData.artistNames.join(', ')}`
        }

        // Generate source event ID
        const dateStr = startsAt.toISOString().split('T')[0]
        let sourceEventId: string
        if (rowData.eventId) {
          sourceEventId = `stone-church-vp-${rowData.eventId}`
        } else {
          const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
          sourceEventId = `stone-church-${dateStr}-${titleSlug}`
        }

        // Build event source URL (same as navigation URL but can be used elsewhere)
        const sourceEventUrl = `https://stonechurchvt.com/events#/events/${rowData.eventId}`

        events.push({
          title,
          description,
          startsAt,
          sourceUrl: sourceEventUrl,
          sourceEventId,
          imageUrl: modalData.imageUrl || undefined,
          // Only set ticketUrl if we found a real one (VenuePilot handles tickets via JS)
          ticketUrl: modalData.ticketUrl || undefined,
        })

        console.log(`[${this.config.name}] Extracted: ${title} @ ${startsAt.toISOString().split('T')[0]}`)

      } catch (error) {
        console.error(`[${this.config.name}] Error processing event ${i + 1} (ID: ${rowData.eventId}):`, error)
      }
    }

    console.log(`[${this.config.name}] Extracted ${events.length} Stone Church events`)
    return events
  }
}
