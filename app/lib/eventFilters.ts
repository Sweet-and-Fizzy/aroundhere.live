// Shared event filter logic for the home page filter panels. Pure functions only;
// the shared state lives in useEventFilters.
import type { CalendarDate } from '@internationalized/date'
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
    venueIds = state.selectedVenueIds
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
