import { tool } from 'ai'
import { z } from 'zod'
import { format } from 'date-fns'

// Helper to format date for display
function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr)
  return format(date, "EEE MMM d, h:mm a")
}

// Get base URL for internal API calls
function getBaseUrl() {
  return process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

// AI SDK tool definitions with Zod schemas
export const chatTools = {
  search_events: tool({
    description:
      'Search for live music events, concerts, and shows in Western Massachusetts. Use this when the user asks about events, shows, concerts, what\'s happening, or wants to find specific performances.',
    inputSchema: z.object({
      q: z.string().optional().describe('Search query - artist name, venue, genre keyword, or general term'),
      startDate: z.string().optional().describe('Start date in ISO format (YYYY-MM-DD). Defaults to today.'),
      endDate: z.string().optional().describe('End date in ISO format (YYYY-MM-DD). Use for "this weekend" or date range queries.'),
      genres: z.array(z.string()).optional().describe('Filter by genres: jazz, rock, folk, blues, country, electronic, hip-hop, classical, etc.'),
      venueIds: z.array(z.string()).optional().describe('Filter by specific venue IDs (use list_venues to get IDs)'),
      limit: z.number().optional().describe('Maximum number of results to return (default 10, max 20)'),
    }),
    execute: async (input) => {
      const params = new URLSearchParams()

      if (input.q) params.set('q', input.q)
      if (input.startDate) params.set('startDate', input.startDate)
      if (input.endDate) params.set('endDate', input.endDate)
      if (input.genres && input.genres.length > 0) {
        params.set('genres', input.genres.join(','))
      }
      if (input.venueIds && input.venueIds.length > 0) {
        params.set('venueIds', input.venueIds.join(','))
      }
      params.set('limit', String(Math.min(input.limit || 10, 20)))
      params.set('musicOnly', 'false')

      const endpoint = input.q ? '/api/search' : '/api/events'
      const baseUrl = getBaseUrl()

      const response = await fetch(`${baseUrl}${endpoint}?${params}`)
      const data = await response.json()

      const events = data.events || []

      return {
        events: events.map((e: Record<string, unknown>) => ({
          title: e.title,
          date: formatEventDate(e.startsAt as string),
          venue: (e.venue as Record<string, unknown>)?.name || 'TBA',
          city: (e.venue as Record<string, unknown>)?.city || '',
          genres: (e.canonicalGenres as string[])?.slice(0, 3) || [],
          coverCharge: e.coverCharge || 'Check venue',
          ticketUrl: e.ticketUrl || null,
          url: `/events/${e.slug}`,
          artists: ((e.eventArtists as Array<{ artist: { name: string } }>) || [])
            .map((ea) => ea.artist.name)
            .slice(0, 3),
        })),
        total: data.totalCount || data.pagination?.total || events.length,
        query: input.q || null,
      }
    },
  }),

  list_venues: tool({
    description:
      'Get a list of music venues in Western Massachusetts. Use when the user asks about venues, places to see shows, or needs venue information.',
    inputSchema: z.object({
      city: z.string().optional().describe('Filter venues by city name (e.g., "Northampton", "Amherst", "Springfield")'),
    }),
    execute: async (input) => {
      const baseUrl = getBaseUrl()
      const response = await fetch(`${baseUrl}/api/venues`)
      const data = await response.json()

      let venues = data.venues || []

      if (input.city) {
        const cityLower = input.city.toLowerCase()
        venues = venues.filter(
          (v: Record<string, unknown>) =>
            v.city && String(v.city).toLowerCase().includes(cityLower)
        )
      }

      return {
        venues: venues.map((v: Record<string, unknown>) => ({
          id: v.id,
          name: v.name,
          city: v.city,
          type: v.venueType,
          url: `/venues/${v.slug}`,
          upcomingEvents: (v._count as Record<string, number>)?.events || 0,
        })),
        total: venues.length,
      }
    },
  }),

  get_venue_events: tool({
    description:
      'Get upcoming events at a specific venue. Use when the user asks what\'s playing at a particular venue.',
    inputSchema: z.object({
      venueName: z.string().describe('Name of the venue (partial match supported, e.g., "Iron Horse" or "Drake")'),
      limit: z.number().optional().describe('Maximum number of events to return (default 10)'),
    }),
    execute: async (input) => {
      const baseUrl = getBaseUrl()

      const venuesResponse = await fetch(`${baseUrl}/api/venues`)
      const venuesData = await venuesResponse.json()

      const venueName = input.venueName.toLowerCase()
      const venue = (venuesData.venues || []).find(
        (v: Record<string, unknown>) =>
          String(v.name).toLowerCase().includes(venueName) ||
          String(v.slug).includes(venueName.replace(/\s+/g, '-'))
      )

      if (!venue) {
        return { error: `Venue "${input.venueName}" not found. Try list_venues to see available venues.` }
      }

      const limit = Math.min(input.limit || 10, 20)
      const eventsResponse = await fetch(
        `${baseUrl}/api/events?venueId=${venue.id}&limit=${limit}&musicOnly=false`
      )
      const eventsData = await eventsResponse.json()

      return {
        venue: {
          name: venue.name,
          city: venue.city,
          type: venue.venueType,
          url: `/venues/${venue.slug}`,
        },
        events: (eventsData.events || []).map((e: Record<string, unknown>) => ({
          title: e.title,
          date: formatEventDate(e.startsAt as string),
          genres: (e.canonicalGenres as string[])?.slice(0, 3) || [],
          coverCharge: e.coverCharge || 'Check venue',
          url: `/events/${e.slug}`,
          artists: ((e.eventArtists as Array<{ artist: { name: string } }>) || [])
            .map((ea) => ea.artist.name)
            .slice(0, 3),
        })),
        total: eventsData.pagination?.total || eventsData.events?.length || 0,
      }
    },
  }),

  get_event_details: tool({
    description:
      'Get full details about a specific event. Use when the user wants more information about a particular show.',
    inputSchema: z.object({
      eventTitle: z.string().describe('Title or partial title of the event to look up'),
    }),
    execute: async (input) => {
      const baseUrl = getBaseUrl()

      const response = await fetch(
        `${baseUrl}/api/search?q=${encodeURIComponent(input.eventTitle)}&limit=1&musicOnly=false`
      )
      const data = await response.json()

      const event = data.events?.[0]
      if (!event) {
        return { error: `Event "${input.eventTitle}" not found. Try search_events with different terms.` }
      }

      const venue = event.venue as Record<string, unknown> | undefined

      return {
        title: event.title,
        description: event.summary || (event.description as string)?.slice(0, 500) || null,
        date: format(new Date(event.startsAt as string), "EEEE, MMMM d, yyyy 'at' h:mm a"),
        doorsAt: event.doorsAt ? format(new Date(event.doorsAt as string), "h:mm a") : null,
        venue: venue?.name || 'TBA',
        address: venue ? `${venue.city || ''}` : null,
        genres: event.canonicalGenres || [],
        coverCharge: event.coverCharge || 'Check venue',
        ageRestriction: event.ageRestriction || 'ALL_AGES',
        ticketUrl: event.ticketUrl || null,
        url: `/events/${event.slug}`,
        artists: ((event.eventArtists as Array<{ artist: { name: string } }>) || []).map(
          (ea) => ea.artist.name
        ),
      }
    },
  }),

  list_genres: tool({
    description:
      'Get available music genres with event counts. Use when the user asks what types of music or genres are available.',
    inputSchema: z.object({
      _placeholder: z.string().optional().describe('No parameters needed'),
    }),
    execute: async () => {
      const baseUrl = getBaseUrl()
      const response = await fetch(`${baseUrl}/api/genres`)
      const data = await response.json()

      const genres = data.genres || []
      const genreLabels = data.genreLabels || {}

      return {
        genres: genres.map((slug: string) => ({
          slug,
          name: genreLabels[slug] || slug,
        })),
        total: genres.length,
      }
    },
  }),
}
