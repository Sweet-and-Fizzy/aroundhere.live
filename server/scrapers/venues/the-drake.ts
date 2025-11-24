import { SquarespaceScraper } from '../platforms/squarespace'
import type { ScraperConfig } from '../types'

export const theDrakeConfig: ScraperConfig = {
  id: 'the-drake',
  name: 'The Drake',
  venueSlug: 'the-drake',
  url: 'https://www.thedrakeamherst.org/events',
  enabled: true,
  schedule: '0 6 * * *', // 6 AM daily
  category: 'VENUE' as const,
  priority: 10,
  timezone: 'America/New_York', // Amherst, MA
  defaultAgeRestriction: 'ALL_AGES', // Concert venue
}

/**
 * Scraper for The Drake in Amherst, MA
 *
 * The Drake uses Squarespace with standard event pages.
 * Each event page has LD+JSON with event details.
 */
export class TheDrakeScraper extends SquarespaceScraper {
  constructor() {
    super(theDrakeConfig)
  }

  protected async waitForContent(): Promise<void> {
    if (!this.page) return

    // Wait for event links to appear
    try {
      await this.page.waitForSelector('a[href*="/events/"]', {
        timeout: 10000,
      })
    } catch {
      // If specific selectors don't appear, wait for general content
      await this.page.waitForTimeout(3000)
    }
  }
}
