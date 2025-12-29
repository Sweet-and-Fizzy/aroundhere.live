/**
 * Shared types for filter components and API interactions
 */

// Event types and type groups
export type EventType =
  | 'MUSIC' | 'DJ' | 'OPEN_MIC' | 'KARAOKE'  // Music types
  | 'COMEDY' | 'THEATER' | 'TRIVIA' | 'GAMES' | 'PRIVATE' | 'FILM'  // Other types
  | 'SPOKEN_WORD' | 'DANCE' | 'MARKET' | 'WORKSHOP' | 'PARTY' | 'SPORTS'
  | 'COMMUNITY' | 'FOOD' | 'DRAG' | 'FITNESS' | 'OTHER'

export type EventTypeGroup = 'ALL_EVENTS' | 'ALL_MUSIC' | 'OTHER_EVENTS'
export type EventTypeSelection = EventType | EventTypeGroup

// All valid event types including groups
export const EVENT_TYPES: EventType[] = [
  'MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE',
  'COMEDY', 'THEATER', 'TRIVIA', 'GAMES', 'PRIVATE', 'FILM',
  'SPOKEN_WORD', 'DANCE', 'MARKET', 'WORKSHOP', 'PARTY', 'SPORTS',
  'COMMUNITY', 'FOOD', 'DRAG', 'FITNESS', 'OTHER'
]
export const EVENT_TYPE_GROUPS: EventTypeGroup[] = ['ALL_EVENTS', 'ALL_MUSIC', 'OTHER_EVENTS']
export const ALL_EVENT_TYPE_SELECTIONS: EventTypeSelection[] = [...EVENT_TYPE_GROUPS, ...EVENT_TYPES]

// Music-related event types (for ALL_MUSIC group)
export const MUSIC_EVENT_TYPES: EventType[] = ['MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE']
// Non-music event types (for OTHER_EVENTS group)
export const NON_MUSIC_EVENT_TYPES: EventType[] = [
  'COMEDY', 'THEATER', 'TRIVIA', 'GAMES', 'PRIVATE', 'FILM',
  'SPOKEN_WORD', 'DANCE', 'MARKET', 'WORKSHOP', 'PARTY', 'SPORTS',
  'COMMUNITY', 'FOOD', 'DRAG', 'FITNESS', 'OTHER'
]

// Date presets
export type DatePreset = 'today' | 'tomorrow' | 'weekend' | 'week' | 'month' | 'all'
export const DATE_PRESETS: DatePreset[] = ['today', 'tomorrow', 'weekend', 'week', 'month', 'all']

// My Events filter options
export type MyEventsOption = 'interested' | 'going' | 'all' | 'recommended'
export const MY_EVENTS_OPTIONS: MyEventsOption[] = ['interested', 'going', 'all', 'recommended']

// Genre type (canonical genre from our system)
export type CanonicalGenre =
  | 'rock'
  | 'indie'
  | 'punk'
  | 'metal'
  | 'alternative'
  | 'folk'
  | 'country'
  | 'bluegrass'
  | 'americana'
  | 'jazz'
  | 'blues'
  | 'soul'
  | 'funk'
  | 'r&b'
  | 'hip-hop'
  | 'rap'
  | 'electronic'
  | 'edm'
  | 'house'
  | 'techno'
  | 'pop'
  | 'singer-songwriter'
  | 'acoustic'
  | 'classical'
  | 'world'
  | 'latin'
  | 'reggae'
  | 'ska'

// Filter state (for useFilterState composable)
export interface FilterState {
  searchQuery: string
  datePreset: DatePreset | string
  selectedRegions: string[]
  selectedCities: string[]
  selectedVenueIds: string[]
  selectedGenres: string[]
  selectedEventTypes: EventTypeSelection[]
  filterByFavoriteArtists: boolean
  filterByFavoriteVenues: boolean
  filterByFavoriteGenres: boolean
  myEvents: MyEventsOption | null
  expandedSection: string | null
}

// API filter parameters (what gets sent to the server)
export interface EventFilterParams {
  q?: string
  regions?: string[]
  cities?: string[]
  venueIds?: string[]
  genres?: string[]
  eventTypes?: EventTypeSelection[]
  datePreset?: DatePreset
  startDate?: string
  endDate?: string
  myEvents?: MyEventsOption
  filterByFavoriteArtists?: boolean
  filterByFavoriteVenues?: boolean
  filterByFavoriteGenres?: boolean
  limit?: number
  offset?: number
}

// Facets response from API
export interface EventFacets {
  genres: Array<{ value: string; count: number }>
  cities: Array<{ city: string; regionSlug?: string; regionName?: string; count: number }>
  eventTypes: Array<{ value: EventType; count: number }>
  regions: Array<{ slug: string; name: string; count: number }>
  dateRanges: {
    today: number
    tomorrow: number
    weekend: number
    week: number
    month: number
    all: number
  }
  total: number
}

// Venue reference for filter lookups
export interface VenueRef {
  id: string
  slug: string
  name: string
  city?: string | null
  regionId?: string | null
}

// Region reference for filter lookups
export interface RegionRef {
  id: string
  slug: string
  name: string
}

// Filter section for collapsible UI
export type FilterSection =
  | 'eventTypes'
  | 'date'
  | 'location'
  | 'genres'
  | 'favorites'
  | 'myEvents'

// Filter change event types
export interface FilterChangeEvent {
  type: 'add' | 'remove' | 'set' | 'reset'
  field: keyof FilterState
  value?: unknown
}

// Default filter state
export const DEFAULT_FILTER_STATE: FilterState = {
  searchQuery: '',
  datePreset: 'all',
  selectedRegions: [],
  selectedCities: [],
  selectedVenueIds: [],
  selectedGenres: [],
  selectedEventTypes: ['ALL_MUSIC'],
  filterByFavoriteArtists: false,
  filterByFavoriteVenues: false,
  filterByFavoriteGenres: false,
  myEvents: null,
  expandedSection: null,
}
