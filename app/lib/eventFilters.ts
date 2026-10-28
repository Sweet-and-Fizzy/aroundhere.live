// Shared event filter logic for the home page filter panels. Pure functions only;
// the shared state lives in useEventFilters.
import { parseDate, type CalendarDate } from '@internationalized/date'
import type { EventFilters } from '../composables/useEvents'

export interface CalendarDateRange {
  start: CalendarDate
  end: CalendarDate
}

export const EVENT_TYPE_GROUPS = {
  ALL_MUSIC: ['MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE'],
  OTHER_EVENTS: ['COMEDY', 'THEATER', 'TRIVIA', 'GAMES', 'PRIVATE', 'FILM', 'SPOKEN_WORD', 'DANCE', 'MARKET', 'WORKSHOP', 'PARTY', 'SPORTS', 'COMMUNITY', 'FOOD', 'DRAG', 'FITNESS', 'OTHER'],
}

export interface EventFilterState {
  searchQuery: string
  datePreset: string
  customDateRange: CalendarDateRange | null
  selectedRegions: string[]
  selectedCities: string[]
  selectedVenueIds: string[]
  selectedGenres: string[]
  // [] means all events; ALL_MUSIC and OTHER_EVENTS stand for their whole group
  selectedEventTypes: string[]
  myEvents: string | null
  recommended: boolean
  filterByFavoriteArtists: boolean
  filterByFavoriteVenues: boolean
  filterByFavoriteGenres: boolean
}

export function defaultFilterState(): EventFilterState {
  return {
    searchQuery: '',
    datePreset: 'all',
    customDateRange: null,
    selectedRegions: [],
    selectedCities: [],
    selectedVenueIds: [],
    selectedGenres: [],
    selectedEventTypes: [],
    myEvents: null,
    recommended: false,
    filterByFavoriteArtists: false,
    filterByFavoriteVenues: false,
    filterByFavoriteGenres: false,
  }
}

export function isDefaultEventTypes(selected: string[]): boolean {
  return selected.length === 0
}

// Format as YYYY-MM-DD from local date parts
export function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getDateRange(preset: string, custom: CalendarDateRange | null, now = new Date()): { startDate: string, endDate?: string } {
  const startDate = new Date(now)
  startDate.setHours(0, 0, 0, 0)

  let endDate: Date | undefined

  switch (preset) {
    case 'today':
      endDate = new Date(startDate)
      break
    case 'tomorrow':
      startDate.setDate(startDate.getDate() + 1)
      endDate = new Date(startDate)
      break
    case 'weekend': {
      const dayOfWeek = now.getDay()
      // Friday through Sunday already counts as the weekend
      if (dayOfWeek !== 0 && dayOfWeek !== 5 && dayOfWeek !== 6) {
        startDate.setDate(now.getDate() + 5 - dayOfWeek)
      }
      const endDayOfWeek = startDate.getDay()
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + (endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek))
      break
    }
    case 'week':
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)
      break
    case 'month':
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 30)
      break
    case 'custom':
      if (custom?.start && custom?.end) {
        return {
          startDate: formatDateParam(new Date(custom.start.year, custom.start.month - 1, custom.start.day)),
          endDate: formatDateParam(new Date(custom.end.year, custom.end.month - 1, custom.end.day)),
        }
      }
      break
  }

  return {
    startDate: formatDateParam(startDate),
    endDate: endDate ? formatDateParam(endDate) : undefined,
  }
}

export function eventTypesToApi(selected: string[]): Pick<EventFilters, 'eventTypes' | 'musicOnly' | 'nonMusicOnly'> {
  const allMusic = selected.includes('ALL_MUSIC')
  const otherEvents = selected.includes('OTHER_EVENTS')
  const specific = selected.filter(t => t !== 'ALL_MUSIC' && t !== 'OTHER_EVENTS')

  if (selected.length === 0 || (allMusic && otherEvents)) return { musicOnly: false }
  if (specific.length === 0) return allMusic ? { musicOnly: true } : { nonMusicOnly: true }

  // A group mixed with specific types has to be spelled out, since the API
  // ignores the music flags once eventTypes is set
  const eventTypes = [
    ...(allMusic ? EVENT_TYPE_GROUPS.ALL_MUSIC : []),
    ...(otherEvents ? EVENT_TYPE_GROUPS.OTHER_EVENTS : []),
    ...specific,
  ]
  return { eventTypes: [...new Set(eventTypes)], musicOnly: false }
}

export interface FavoritesForFilters {
  artists: { id: string }[]
  venues: { id: string }[]
  genres: string[]
}

export function toApiFilters(state: EventFilterState, ctx: { mapFilteredVenueIds: string[] | null, favorites: FavoritesForFilters }): EventFilters {
  const { startDate, endDate } = getDateRange(state.datePreset, state.customDateRange)
  const { mapFilteredVenueIds, favorites } = ctx

  // Selected venues and the map filter combine as an intersection
  let venueIds: string[] | undefined
  if (state.selectedVenueIds.length > 0 && mapFilteredVenueIds !== null) {
    venueIds = state.selectedVenueIds.filter(id => mapFilteredVenueIds.includes(id))
  } else if (state.selectedVenueIds.length > 0) {
    venueIds = [...state.selectedVenueIds]
  } else if (mapFilteredVenueIds !== null) {
    venueIds = mapFilteredVenueIds
  }

  return {
    startDate,
    endDate,
    regions: state.selectedRegions.length > 0 ? [...state.selectedRegions] : undefined,
    cities: state.selectedCities.length > 0 ? [...state.selectedCities] : undefined,
    venueIds: venueIds && venueIds.length > 0 ? venueIds : undefined,
    q: state.searchQuery || undefined,
    genres: state.selectedGenres.length > 0 ? [...state.selectedGenres] : undefined,
    ...eventTypesToApi(state.selectedEventTypes),
    favoriteArtistIds: state.filterByFavoriteArtists && favorites.artists.length > 0 ? favorites.artists.map(a => a.id) : undefined,
    favoriteVenueIds: state.filterByFavoriteVenues && favorites.venues.length > 0 ? favorites.venues.map(v => v.id) : undefined,
    favoriteGenres: state.filterByFavoriteGenres && favorites.genres.length > 0 ? [...favorites.genres] : undefined,
    myEvents: state.recommended ? 'recommended' : (state.myEvents || undefined),
  }
}

const VALID_EVENT_TYPES = new Set(['ALL_MUSIC', 'OTHER_EVENTS', ...EVENT_TYPE_GROUPS.ALL_MUSIC, ...EVENT_TYPE_GROUPS.OTHER_EVENTS])
const VALID_DATE_PRESETS = ['today', 'tomorrow', 'weekend', 'week', 'month', 'all', 'custom']
const VALID_MY_EVENTS = ['interested', 'going', 'all']

// Every query key the parser reads, including legacy ones
export const FILTER_QUERY_KEYS = [
  'q', 'regions', 'cities', 'venues', 'venueIds', 'genres', 'types', 'eventTypes',
  'date', 'dateStart', 'dateEnd', 'myEvents', 'recommended',
]

function queryString(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && first !== '' ? first : undefined
}

function queryList(value: unknown): string[] | undefined {
  return queryString(value)?.split(',').filter(Boolean)
}

// Older saves stored selections as { label, value } objects
function plainList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => (item && typeof item === 'object' && 'value' in item ? (item as { value: unknown }).value : item))
    .filter((item): item is string => typeof item === 'string')
}

function validEventTypes(types: string[]): string[] {
  // ALL_EVENTS was the sidebar's name for no selection
  return types.filter(t => VALID_EVENT_TYPES.has(t))
}

function parseDay(value: unknown): CalendarDate | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  try {
    return parseDate(value)
  } catch {
    return null
  }
}

function parseRange(start: unknown, end: unknown): CalendarDateRange | null {
  const startDay = parseDay(start)
  const endDay = parseDay(end)
  return startDay && endDay ? { start: startDay, end: endDay } : null
}

export function parseFiltersFromQuery(query: Record<string, unknown>): { filters: Partial<EventFilterState>, venueSlugs: string[] } | null {
  if (!FILTER_QUERY_KEYS.some(key => queryString(query[key]) !== undefined)) return null

  const filters: Partial<EventFilterState> = {}
  const q = queryString(query.q)
  if (q) filters.searchQuery = q
  const regions = queryList(query.regions)
  if (regions) filters.selectedRegions = regions
  const cities = queryList(query.cities)
  if (cities) filters.selectedCities = cities
  const venueIds = queryList(query.venueIds)
  if (venueIds) filters.selectedVenueIds = venueIds
  const genres = queryList(query.genres)
  if (genres) filters.selectedGenres = genres
  const types = queryList(query.types) ?? queryList(query.eventTypes)
  if (types) filters.selectedEventTypes = validEventTypes(types)

  const range = parseRange(queryString(query.dateStart), queryString(query.dateEnd))
  const date = queryString(query.date)
  if (range) {
    filters.datePreset = 'custom'
    filters.customDateRange = range
  } else if (date) {
    filters.datePreset = VALID_DATE_PRESETS.includes(date) && date !== 'custom' ? date : 'all'
  }

  // myEvents=recommended is the old spelling of recommended=true
  const myEvents = queryString(query.myEvents)
  if (myEvents === 'recommended' || queryString(query.recommended) === 'true') {
    filters.recommended = true
    filters.myEvents = null
  }
  if (myEvents && VALID_MY_EVENTS.includes(myEvents)) filters.myEvents = myEvents

  return { filters, venueSlugs: queryList(query.venues) ?? [] }
}

export function parseStoredFilters(raw: string | null): Partial<EventFilterState> | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const saved = data as Record<string, unknown>

  let eventTypes = plainList(saved.selectedEventTypes)
  // Old saves spelled out the full music list instead of ALL_MUSIC
  if (EVENT_TYPE_GROUPS.ALL_MUSIC.every(t => eventTypes.includes(t)) && eventTypes.every(t => EVENT_TYPE_GROUPS.ALL_MUSIC.includes(t))) {
    eventTypes = ['ALL_MUSIC']
  }

  const range = saved.customDateRangeData && typeof saved.customDateRangeData === 'object'
    ? parseRange((saved.customDateRangeData as Record<string, unknown>).startDate, (saved.customDateRangeData as Record<string, unknown>).endDate)
    : null
  const datePreset = typeof saved.datePreset === 'string' && VALID_DATE_PRESETS.includes(saved.datePreset) ? saved.datePreset : 'all'

  return {
    searchQuery: typeof saved.searchQuery === 'string' ? saved.searchQuery : '',
    datePreset: datePreset === 'custom' && !range ? 'all' : datePreset,
    customDateRange: range,
    selectedRegions: plainList(saved.selectedRegions),
    selectedCities: plainList(saved.selectedCities),
    selectedVenueIds: plainList(saved.selectedVenueIds),
    selectedGenres: plainList(saved.selectedGenres),
    selectedEventTypes: validEventTypes(eventTypes),
    myEvents: typeof saved.myEvents === 'string' && VALID_MY_EVENTS.includes(saved.myEvents) ? saved.myEvents : null,
    recommended: saved.recommended === true,
    filterByFavoriteArtists: saved.filterByFavoriteArtists === true,
    filterByFavoriteVenues: saved.filterByFavoriteVenues === true,
    filterByFavoriteGenres: saved.filterByFavoriteGenres === true,
  }
}

export function serializeFilters(state: EventFilterState): string {
  const range = state.customDateRange
  return JSON.stringify({
    datePreset: state.datePreset,
    customDateRangeData: range ? { startDate: range.start.toString(), endDate: range.end.toString() } : null,
    selectedRegions: state.selectedRegions,
    selectedCities: state.selectedCities,
    selectedVenueIds: state.selectedVenueIds,
    selectedGenres: state.selectedGenres,
    selectedEventTypes: state.selectedEventTypes,
    searchQuery: state.searchQuery,
    myEvents: state.myEvents,
    recommended: state.recommended,
    filterByFavoriteArtists: state.filterByFavoriteArtists,
    filterByFavoriteVenues: state.filterByFavoriteVenues,
    filterByFavoriteGenres: state.filterByFavoriteGenres,
  })
}

export function filtersToQuery(state: EventFilterState, venues: { id: string, slug: string }[]): Record<string, string> {
  const query: Record<string, string> = {}
  if (state.searchQuery) query.q = state.searchQuery
  if (state.selectedRegions.length > 0) query.regions = state.selectedRegions.join(',')
  if (state.selectedCities.length > 0) query.cities = state.selectedCities.join(',')
  const slugs = state.selectedVenueIds
    .map(id => venues.find(v => v.id === id)?.slug)
    .filter((slug): slug is string => !!slug)
  if (slugs.length > 0) query.venues = slugs.join(',')
  if (state.selectedGenres.length > 0) query.genres = state.selectedGenres.join(',')
  if (state.selectedEventTypes.length > 0) query.types = state.selectedEventTypes.join(',')
  if (state.datePreset === 'custom' && state.customDateRange) {
    query.dateStart = state.customDateRange.start.toString()
    query.dateEnd = state.customDateRange.end.toString()
  } else if (state.datePreset !== 'all' && state.datePreset !== 'custom') {
    query.date = state.datePreset
  }
  if (state.myEvents) query.myEvents = state.myEvents
  if (state.recommended) query.recommended = 'true'
  return query
}

// Replace the filter params in a search string, keeping anything else (utm_* and the like)
export function mergeFilterQuery(search: string, filterQuery: Record<string, string>): string {
  const params = new URLSearchParams(search)
  for (const key of FILTER_QUERY_KEYS) params.delete(key)
  for (const [key, value] of Object.entries(filterQuery)) params.set(key, value)
  return params.toString()
}

// Haversine distance in miles
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function venuesWithinRadius(
  venues: { id: string, latitude?: number | null, longitude?: number | null }[],
  center: { lat: number, lng: number },
  miles: number,
): string[] {
  return venues
    .filter(v => v.latitude && v.longitude && distanceMiles(center.lat, center.lng, v.latitude, v.longitude) <= miles)
    .map(v => v.id)
}
