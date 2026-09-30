import { ElfsightScraper, type ElfsightScraperConfig } from '../platforms/elfsight'

export const parlorRoomConfig: ElfsightScraperConfig = {
  id: 'parlor-room',
  name: 'The Parlor Room',
  venueSlug: 'the-parlor-room',
  url: 'https://www.ironhorse.org/the-parlor-room',
  enabled: true,
  schedule: '0 6,14 * * *', // 6 AM and 2 PM daily
  category: 'VENUE' as const,
  priority: 10,
  timezone: 'America/New_York', // Northampton, MA
  defaultAgeRestriction: 'ALL_AGES', // Intimate listening room
  // Same combined calendar as Iron Horse, filtered to this venue
  widgetId: 'c4b76df1-e520-4ed0-9318-f18bd056c38a',
  locationId: 'fdad738b-571b-44b2-bee2-71e03b473e98', // THE PARLOR ROOM
}

export class ParlorRoomScraper extends ElfsightScraper {
  constructor() {
    super(parlorRoomConfig)
  }
}
