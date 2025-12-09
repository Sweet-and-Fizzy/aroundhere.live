export interface EventFilters {
  regionId?: string
  venueId?: string
  venueIds?: string[]
  startDate?: string
  endDate?: string
  genres?: string[]
  q?: string
  offset?: number
  limit?: number
  musicOnly?: boolean
  eventType?: string
  eventTypes?: string[]
}

export type EventType =
  | 'MUSIC'
  | 'DJ'
  | 'OPEN_MIC'
  | 'COMEDY'
  | 'THEATER'
  | 'TRIVIA'
  | 'KARAOKE'
  | 'PRIVATE'
  | 'FILM'
  | 'SPOKEN_WORD'
  | 'OTHER'

export interface Event {
  id: string
  title: string
  slug: string
  description?: string
  descriptionHtml?: string
  summary?: string
  imageUrl?: string
  startsAt: string
  endsAt?: string
  doorsAt?: string
  coverCharge?: string
  ageRestriction: string
  ticketUrl?: string
  sourceUrl?: string
  genres?: string[]
  // Classification fields
  isMusic?: boolean | null
  eventType?: EventType | null
  canonicalGenres?: string[]
  venue?: {
    id: string
    name: string
    slug: string
    city?: string
    latitude?: number
    longitude?: number
    logoUrl?: string
  }
  eventArtists: {
    artist: {
      id: string
      name: string
      slug: string
      genres: string[]
      spotifyId?: string | null
      spotifyMatchStatus?: string
    }
    order: number
  }[]
}

export function useEvents() {
  const events = ref<Event[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  })

  async function fetchEvents(filters: EventFilters = {}, append = false) {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()

      if (filters.regionId) params.set('regionId', filters.regionId)
      if (filters.venueId) params.set('venueId', filters.venueId)
      if (filters.venueIds?.length) params.set('venueIds', filters.venueIds.join(','))
      if (filters.startDate) params.set('startDate', filters.startDate)
      if (filters.endDate) params.set('endDate', filters.endDate)
      if (filters.genres?.length) params.set('genres', filters.genres.join(','))
      if (filters.offset) params.set('offset', filters.offset.toString())
      if (filters.limit) params.set('limit', filters.limit.toString())
      if (filters.musicOnly === false) params.set('musicOnly', 'false')
      if (filters.eventType) params.set('eventType', filters.eventType)
      if (filters.eventTypes?.length) params.set('eventTypes', filters.eventTypes.join(','))

      const response = await $fetch<{
        events: Event[]
        pagination: typeof pagination.value
      }>(`/api/events?${params.toString()}`)

      if (append) {
        events.value = [...events.value, ...response.events]
      } else {
        events.value = response.events
      }
      pagination.value = response.pagination
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch events'
    } finally {
      loading.value = false
    }
  }

  async function searchEvents(filters: EventFilters) {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()

      if (filters.q) params.set('q', filters.q)
      if (filters.regionId) params.set('regionId', filters.regionId)
      if (filters.startDate) params.set('startDate', filters.startDate)
      if (filters.endDate) params.set('endDate', filters.endDate)
      if (filters.genres?.length) params.set('genres', filters.genres.join(','))
      if (filters.venueId) params.set('venueId', filters.venueId)

      const response = await $fetch<{
        events: Event[]
        artists: { id: string; name: string; slug: string }[]
        venues: { id: string; name: string; slug: string }[]
      }>(`/api/search?${params.toString()}`)

      events.value = response.events
      // Update pagination for search results (no server-side pagination for search)
      pagination.value = {
        total: response.events.length,
        limit: response.events.length,
        offset: 0,
        hasMore: false,
      }
      return response
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Search failed'
      return { events: [], artists: [], venues: [] }
    } finally {
      loading.value = false
    }
  }

  return {
    events,
    loading,
    error,
    pagination,
    fetchEvents,
    searchEvents,
  }
}
