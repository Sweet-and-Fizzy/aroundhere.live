export interface EventFilters {
  regionId?: string
  regions?: string[]
  cities?: string[]
  venueId?: string
  venueIds?: string[]
  startDate?: string
  endDate?: string
  genres?: string[]
  q?: string
  offset?: number
  limit?: number
  musicOnly?: boolean
  nonMusicOnly?: boolean
  eventType?: string
  eventTypes?: string[]
  // Favorites filters
  favoriteArtistIds?: string[]
  favoriteVenueIds?: string[]
  favoriteGenres?: string[]
  // My Events filter
  myEvents?: string
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
    region?: {
      timezone: string
    }
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
  // Use useState for persistence across navigations
  const events = useState<Event[]>('events', () => [])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = useState('events-pagination', () => ({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  }))

  async function fetchEvents(filters: EventFilters = {}, append = false) {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()

      if (filters.q) params.set('q', filters.q)
      if (filters.regionId) params.set('regionId', filters.regionId)
      if (filters.regions?.length) params.set('regions', filters.regions.join(','))
      if (filters.cities?.length) params.set('cities', filters.cities.join(','))
      if (filters.venueId) params.set('venueId', filters.venueId)
      if (filters.venueIds?.length) params.set('venueIds', filters.venueIds.join(','))
      if (filters.startDate) params.set('startDate', filters.startDate)
      if (filters.endDate) params.set('endDate', filters.endDate)
      if (filters.genres?.length) params.set('genres', filters.genres.join(','))
      if (filters.offset) params.set('offset', filters.offset.toString())
      if (filters.limit) params.set('limit', filters.limit.toString())
      if (filters.musicOnly !== undefined) params.set('musicOnly', filters.musicOnly.toString())
      if (filters.nonMusicOnly) params.set('nonMusicOnly', 'true')
      if (filters.eventType) params.set('eventType', filters.eventType)
      if (filters.eventTypes?.length) params.set('eventTypes', filters.eventTypes.join(','))
      // Favorites filters
      if (filters.favoriteArtistIds?.length) params.set('favoriteArtistIds', filters.favoriteArtistIds.join(','))
      if (filters.favoriteVenueIds?.length) params.set('favoriteVenueIds', filters.favoriteVenueIds.join(','))
      if (filters.favoriteGenres?.length) params.set('favoriteGenres', filters.favoriteGenres.join(','))
      // My Events filter
      if (filters.myEvents) params.set('myEvents', filters.myEvents)

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

  const searchTotalCount = useState('events-search-total', () => 0)

  async function searchEvents(filters: EventFilters) {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()

      if (filters.q) params.set('q', filters.q)
      if (filters.regionId) params.set('regionId', filters.regionId)
      if (filters.regions?.length) params.set('regions', filters.regions.join(','))
      if (filters.cities?.length) params.set('cities', filters.cities.join(','))
      if (filters.startDate) params.set('startDate', filters.startDate)
      if (filters.endDate) params.set('endDate', filters.endDate)
      if (filters.genres?.length) params.set('genres', filters.genres.join(','))
      if (filters.venueId) params.set('venueId', filters.venueId)
      if (filters.venueIds?.length) params.set('venueIds', filters.venueIds.join(','))
      if (filters.eventTypes?.length) params.set('eventTypes', filters.eventTypes.join(','))
      if (filters.musicOnly !== undefined) params.set('musicOnly', filters.musicOnly.toString())
      if (filters.nonMusicOnly) params.set('nonMusicOnly', 'true')
      if (filters.limit) params.set('limit', filters.limit.toString())

      const response = await $fetch<{
        events: Event[]
        artists: { id: string; name: string; slug: string }[]
        venues: { id: string; name: string; slug: string }[]
        filteredCount: number
        totalCount: number
      }>(`/api/search?${params.toString()}`)

      events.value = response.events
      searchTotalCount.value = response.totalCount
      // Update pagination for search results (no server-side pagination for search)
      pagination.value = {
        total: response.filteredCount,
        limit: response.filteredCount,
        offset: 0,
        hasMore: false,
      }
      return response
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Search failed'
      searchTotalCount.value = 0
      return { events: [], artists: [], venues: [], filteredCount: 0, totalCount: 0 }
    } finally {
      loading.value = false
    }
  }

  return {
    events,
    loading,
    error,
    pagination,
    searchTotalCount,
    fetchEvents,
    searchEvents,
  }
}
