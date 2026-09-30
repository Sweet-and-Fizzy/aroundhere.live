import { ElfsightScraper, type ElfsightScraperConfig } from '../platforms/elfsight'

export const ironHorseConfig: ElfsightScraperConfig = {
  id: 'iron-horse',
  name: 'Iron Horse Music Hall',
  venueSlug: 'iron-horse-music-hall',
  url: 'https://www.ironhorse.org/shows',
  enabled: true,
  schedule: '0 6,14 * * *', // 6 AM and 2 PM daily
  category: 'VENUE' as const,
  priority: 10,
  timezone: 'America/New_York', // Northampton, MA
  defaultAgeRestriction: 'ALL_AGES', // Concert hall - varies by show but generally all ages
  // Combined Iron Horse / Parlor Room calendar (replaced the per-venue widgets in Aug 2026)
  widgetId: 'c4b76df1-e520-4ed0-9318-f18bd056c38a',
  locationId: 'e1912f9f-ec16-4a0e-a01c-a5bc84220db0', // THE IRON HORSE
}

export class IronHorseScraper extends ElfsightScraper {
  constructor() {
    super(ironHorseConfig)
  }
}
