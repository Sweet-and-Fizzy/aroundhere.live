import { EventbriteScraper, type EventbriteScraperConfig } from '../platforms/eventbrite'

const config: EventbriteScraperConfig = {
  id: 'daily-operation',
  name: 'Daily Operation',
  venueSlug: 'daily-operation',
  organizerId: '40923753953',
  url: '', // Set by EventbriteScraper based on organizerId
  enabled: true,
  schedule: '0 6,14 * * *', // 6 AM and 2 PM daily
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  // No defaultAgeRestriction - we extract it from each event's Eventbrite page
}

/**
 * Scraper for Daily Operation in Easthampton, MA
 *
 * Daily Operation is a restaurant that hosts live music events.
 * They use Eventbrite for ticketing, so we scrape their organizer page.
 */
export class DailyOperationScraper extends EventbriteScraper {
  constructor() {
    super(config)
  }
}
