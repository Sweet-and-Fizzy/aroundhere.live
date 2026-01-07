import { tool } from 'ai'
import { z } from 'zod'
import { format, addDays } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import {
  getUserProfile,
  findCandidateEvents,
  scoreEventsForUser,
  rankRecommendations,
} from '../services/recommendations'

// Default timezone for displaying dates to users
const DEFAULT_TIMEZONE = 'America/New_York'

// Helper to format date for display in user's timezone
function formatEventDate(dateStr: string, timezone = DEFAULT_TIMEZONE): string {
  const utcDate = new Date(dateStr)
  const zonedDate = toZonedTime(utcDate, timezone)
  return format(zonedDate, "EEE MMM d, h:mm a")
}

// Get base URL for internal API calls
function getBaseUrl() {
  return process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

// Factory function to create chat tools with optional user context
export function createChatTools(userId?: string) {
  return {
  search_events: tool({
    description:
      'Search for events including concerts, theater, comedy, film screenings, art shows, and other cultural events. Use this when the user asks about events, shows, what\'s happening, or wants to find specific performances.',
    inputSchema: z.object({
      q: z.string().optional().describe('Search query - artist name, venue, genre keyword, or general term'),
      startDate: z.string().optional().describe('Start date in YYYY-MM-DD format. Defaults to today. For monthly queries like "January", use the first day of that month.'),
      endDate: z.string().optional().describe('End date in YYYY-MM-DD format. Use for date range queries. For monthly queries like "January", use the last day of that month.'),
      genres: z.array(z.string()).optional().describe('Filter by genres: jazz, rock, folk, blues, country, electronic, hip-hop, classical, etc.'),
      venueIds: z.array(z.string()).optional().describe('Filter by specific venue IDs (use list_venues to get IDs)'),
      state: z.string().optional().describe('Filter by US state abbreviation (e.g., "MA", "VT", "NH"). Use for queries like "events in Vermont"'),
      city: z.string().optional().describe('Filter by city name (e.g., "Northampton", "Brattleboro"). Use for queries like "events in Brattleboro"'),
      limit: z.number().optional().describe('Maximum number of results to return (default 20, max 20). Always use 20 for broad queries like "what\'s happening" or date-range queries.'),
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
      if (input.state) params.set('state', input.state)
      if (input.city) params.set('city', input.city)
      params.set('limit', String(Math.min(input.limit || 20, 20)))
      params.set('musicOnly', 'false')

      const endpoint = input.q ? '/api/search' : '/api/events'
      const baseUrl = getBaseUrl()

      const response = await fetch(`${baseUrl}${endpoint}?${params}`)
      const data = await response.json()

      const events = data.events || []

      return {
        events: events.map((e: Record<string, unknown>) => {
          const venue = e.venue as Record<string, unknown> | undefined
          return {
            title: e.title,
            date: formatEventDate(e.startsAt as string),
            venue: venue?.name || 'TBA',
            city: venue?.city || '',
            state: venue?.state || '',
            genres: (e.canonicalGenres as string[])?.slice(0, 3) || [],
            coverCharge: e.coverCharge || 'Check venue',
            ticketUrl: e.ticketUrl || null,
            url: `/events/${e.slug}`,
            artists: ((e.eventArtists as Array<{ artist: { name: string } }>) || [])
              .map((ea) => ea.artist.name)
              .slice(0, 3),
          }
        }),
        total: data.totalCount || data.pagination?.total || events.length,
        query: input.q || null,
      }
    },
  }),

  list_venues: tool({
    description:
      'Get a list of venues including music venues, theaters, galleries, and other event spaces. Use when the user asks about venues, places to see shows, or needs venue information.',
    inputSchema: z.object({
      city: z.string().optional().describe('Filter venues by city name (e.g., "Northampton", "Amherst", "Brattleboro")'),
      state: z.string().optional().describe('Filter venues by US state abbreviation (e.g., "MA", "VT")'),
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

      if (input.state) {
        const stateLower = input.state.toLowerCase()
        venues = venues.filter(
          (v: Record<string, unknown>) =>
            v.state && String(v.state).toLowerCase() === stateLower
        )
      }

      return {
        venues: venues.map((v: Record<string, unknown>) => ({
          id: v.id,
          name: v.name,
          city: v.city,
          state: v.state,
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
      'Get available genres and event categories with event counts. Use when the user asks what types of music, events, or genres are available.',
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

  get_my_favorites: tool({
    description:
      'Get the current user\'s favorite artists, venues, and genres. Use when the user asks about their favorites, saved items, or wants to see events from their favorites.',
    inputSchema: z.object({
      _placeholder: z.string().optional().describe('No parameters needed'),
    }),
    execute: async () => {
      if (!userId) {
        return {
          error: 'You need to sign in to use favorites. Visit /login to sign in.',
          signInUrl: '/login',
        }
      }

      const [artists, venues, genres] = await Promise.all([
        prisma.userFavoriteArtist.findMany({
          where: { userId },
          include: {
            artist: {
              select: {
                id: true,
                name: true,
                slug: true,
                genres: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.userFavoriteVenue.findMany({
          where: { userId },
          include: {
            venue: {
              select: {
                id: true,
                name: true,
                slug: true,
                city: true,
                state: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.userFavoriteGenre.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      return {
        artists: artists.map(f => ({
          name: f.artist.name,
          genres: f.artist.genres?.slice(0, 3) || [],
          url: `/artists/${f.artist.slug}`,
        })),
        venues: venues.map(f => ({
          name: f.venue.name,
          city: f.venue.city,
          state: f.venue.state,
          url: `/venues/${f.venue.slug}`,
        })),
        genres: genres.map(f => f.genre),
        isLoggedIn: true,
      }
    },
  }),

  get_events_from_favorites: tool({
    description:
      'Get upcoming events featuring the user\'s favorite artists or at their favorite venues. Use when the user asks "what shows are my favorite artists playing" or "events at my favorite venues".',
    inputSchema: z.object({
      type: z.enum(['artists', 'venues', 'all']).optional().describe('Filter by favorite type: artists, venues, or all (default: all)'),
      limit: z.number().optional().describe('Maximum number of events to return (default 20)'),
    }),
    execute: async (input) => {
      if (!userId) {
        return {
          error: 'You need to sign in to use favorites. Visit /login to sign in.',
          signInUrl: '/login',
        }
      }

      const type = input.type || 'all'
      const limit = Math.min(input.limit || 20, 20)
      const now = new Date()

      // Get user's favorites
      const [favoriteArtists, favoriteVenues] = await Promise.all([
        type === 'venues' ? [] : prisma.userFavoriteArtist.findMany({
          where: { userId },
          select: { artistId: true },
        }),
        type === 'artists' ? [] : prisma.userFavoriteVenue.findMany({
          where: { userId },
          select: { venueId: true },
        }),
      ])

      const artistIds = favoriteArtists.map(f => f.artistId)
      const venueIds = favoriteVenues.map(f => f.venueId)

      if (artistIds.length === 0 && venueIds.length === 0) {
        return {
          events: [],
          message: 'You haven\'t favorited any artists or venues yet. Use the heart icon on events to add favorites!',
        }
      }

      // Build query conditions
      const conditions: Prisma.EventWhereInput[] = []
      if (artistIds.length > 0) {
        conditions.push({
          eventArtists: {
            some: {
              artistId: { in: artistIds },
            },
          },
        })
      }
      if (venueIds.length > 0) {
        conditions.push({
          venueId: { in: venueIds },
        })
      }

      const events = await prisma.event.findMany({
        where: {
          startsAt: { gte: now },
          isCancelled: false,
          OR: conditions,
        },
        include: {
          venue: {
            select: {
              name: true,
              slug: true,
              city: true,
              state: true,
            },
          },
          eventArtists: {
            include: {
              artist: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { startsAt: 'asc' },
        take: limit,
      })

      return {
        events: events.map((e: typeof events[number]) => {
          const eventArtists = e.eventArtists as Array<{ artistId: string; artist: { id: string; name: string } }>
          const venue = e.venue as { name: string; slug: string; city: string | null; state: string | null } | null
          const matchedArtists = eventArtists
            .filter((ea) => artistIds.includes(ea.artistId))
            .map((ea) => ea.artist.name)
          const isVenueFavorite = venueIds.includes(e.venueId || '')

          return {
            title: e.title,
            date: formatEventDate(e.startsAt.toISOString()),
            venue: venue?.name || 'TBA',
            city: venue?.city || '',
            url: `/events/${e.slug}`,
            matchReason: [
              ...(matchedArtists.length > 0 ? [`Favorite artist: ${matchedArtists.join(', ')}`] : []),
              ...(isVenueFavorite ? ['Favorite venue'] : []),
            ].join('; '),
            artists: eventArtists.map((ea) => ea.artist.name).slice(0, 3),
          }
        }),
        total: events.length,
        favoriteArtistCount: artistIds.length,
        favoriteVenueCount: venueIds.length,
      }
    },
  }),

  get_personalized_recommendations: tool({
    description:
      'Get AI-powered personalized event recommendations based on the user\'s taste profile, favorite genres, venues, artists, and described interests. Uses embedding similarity and preference matching. Use when the user asks "recommend something", "what should I see", "events I might like", "personalized recommendations", or similar. IMPORTANT: This tool defaults to the next 2 weeks only. If the user asks about a specific month or time period (e.g., "January", "next month"), you MUST pass explicit startDate and endDate parameters.',
    inputSchema: z.object({
      limit: z.number().optional().describe('Maximum number of recommendations (default 10, max 15)'),
      startDate: z.string().optional().describe('Start date in YYYY-MM-DD format. Defaults to today. For monthly queries like "January", use the first day of that month (e.g., "2026-01-01").'),
      endDate: z.string().optional().describe('End date in YYYY-MM-DD format. Defaults to 2 weeks from today. For monthly queries like "January", use the last day of that month (e.g., "2026-01-31").'),
    }),
    execute: async (input) => {
      if (!userId) {
        return {
          error: 'You need to sign in to get personalized recommendations. Visit /login to sign in.',
          signInUrl: '/login',
        }
      }

      const limit = Math.min(input.limit || 10, 15)
      const now = new Date()
      const startDate = input.startDate ? new Date(input.startDate) : now
      const endDate = input.endDate ? new Date(input.endDate) : addDays(now, 14)

      // Get user's profile with taste embedding and favorites
      const userProfile = await getUserProfile(userId)
      if (!userProfile) {
        return {
          error: 'Could not load your profile. Please try again.',
        }
      }

      const hasTasteProfile = !!userProfile.tasteProfileEmbedding
      const hasFavorites = userProfile.favoriteArtistIds.length > 0 ||
        userProfile.favoriteVenueIds.length > 0 ||
        userProfile.favoriteGenres.length > 0 ||
        userProfile.favoriteEventTypes.length > 0

      if (!hasTasteProfile && !hasFavorites) {
        return {
          events: [],
          message: 'You haven\'t set up your taste profile or added any favorites yet. Visit /interests to tell us what you like, or use the heart icon on events to favorite artists, venues, and genres.',
          setupUrl: '/interests',
        }
      }

      // Find candidate events with embeddings
      const candidates = await findCandidateEvents(
        startDate,
        endDate,
        [], // no exclusions
        limit * 3, // fetch more candidates than needed for scoring
        userProfile.regionId
      )

      if (candidates.length === 0) {
        return {
          events: [],
          message: 'No upcoming events found in this date range. Try expanding the date range.',
        }
      }

      // Score events against user's taste profile
      const scored = await scoreEventsForUser(candidates, userProfile)

      // Rank and filter by confidence (use lower threshold for chat - 0.4 instead of 0.6)
      const ranked = rankRecommendations(scored, 0.4, limit)

      if (ranked.length === 0) {
        return {
          events: [],
          message: 'No strong matches found for your taste profile. This can happen if the upcoming events don\'t align with your interests. Try browsing all events or adjusting your preferences.',
        }
      }

      return {
        events: ranked.map(r => ({
          title: r.event.title,
          date: formatEventDate(r.event.startsAt.toISOString()),
          venue: r.event.venue?.name || 'TBA',
          city: r.event.venue?.city || '',
          genres: r.event.canonicalGenres.slice(0, 3),
          url: `/events/${r.event.slug}`,
          artists: r.event.artists.map(a => a.name).slice(0, 3),
          matchScore: Math.round(r.score * 100),
          reasons: r.reasons,
        })),
        total: ranked.length,
        profileInfo: {
          hasTasteProfile,
          favoriteArtistCount: userProfile.favoriteArtistIds.length,
          favoriteVenueCount: userProfile.favoriteVenueIds.length,
          favoriteGenreCount: userProfile.favoriteGenres.length,
          favoriteEventTypeCount: userProfile.favoriteEventTypes.length,
          interestDescription: userProfile.interestDescription,
        },
      }
    },
  }),
  }
}

// Legacy export for backwards compatibility (anonymous user)
export const chatTools = createChatTools()
