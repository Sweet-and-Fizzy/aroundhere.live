/**
 * Event filter state shared by the home page and both filter panels.
 * The page owns the lifecycle (restore after mount, persist, fetch); panels only
 * read and write the state.
 */
import { computed, nextTick } from 'vue'
import {
  defaultFilterState,
  filtersToQuery,
  mergeFilterQuery,
  parseFiltersFromQuery,
  parseStoredFilters,
  serializeFilters,
  toApiFilters,
  venuesWithinRadius,
  type EventFilterState,
} from '../lib/eventFilters'

const STORAGE_KEY = 'eventFilters'
const MAP_BOUNDS_KEY = 'mapBounds'

export interface FilterVenue {
  id: string
  slug: string
  latitude?: number | null
  longitude?: number | null
}

export interface MapCenter {
  lat: number
  lng: number
  radius: number | 'view'
}

export function useEventFilters() {
  const route = useRoute()
  const { favorites } = useFavorites()
  const { updateRegion } = useCurrentRegion()

  const filters = useState<EventFilterState>('event-filters', defaultFilterState)
  const mapFilteredVenueIds = useState<string[] | null>('event-filters-map-venues', () => null)
  const mapCenter = useState<MapCenter | null>('event-filters-map-center', () => null)
  const pendingVenueSlugs = useState<string[]>('event-filters-pending-venues', () => [])
  const restored = useState('event-filters-restored', () => false)
  const restoring = useState('event-filters-restoring', () => false)
  const regionAutoSelected = useState('event-filters-region-auto-selected', () => false)

  const apiFilters = computed(() => toApiFilters(filters.value, {
    mapFilteredVenueIds: mapFilteredVenueIds.value,
    favorites: favorites.value,
  }))

  // True from the start of restore() until the next tick, so watchers can skip it
  function isRestoring() {
    return restoring.value
  }

  // Apply URL filters, or saved ones when the URL has none. Runs once per app session.
  function restore(venues: FilterVenue[] | undefined) {
    if (restored.value) return
    restoring.value = true
    const fromUrl = parseFiltersFromQuery(route.query)
    let stored: Partial<EventFilterState> | null = null
    if (!fromUrl) {
      try {
        stored = parseStoredFilters(localStorage.getItem(STORAGE_KEY))
      } catch {
        // Storage can be unavailable (private mode, blocked site data)
      }
    }
    filters.value = { ...defaultFilterState(), ...(fromUrl?.filters ?? stored ?? {}) }
    pendingVenueSlugs.value = fromUrl?.venueSlugs ?? []
    restored.value = true
    resolvePendingVenues(venues)
    nextTick(() => {
      restoring.value = false
    })
  }

  // Venue links use slugs; wait for the venue list before mapping them to IDs
  function resolvePendingVenues(venues: FilterVenue[] | undefined) {
    if (!venues?.length || pendingVenueSlugs.value.length === 0) return
    const ids = pendingVenueSlugs.value
      .map(slug => venues.find(v => v.slug === slug)?.id)
      .filter((id): id is string => !!id)
    filters.value = { ...filters.value, selectedVenueIds: ids }
    pendingVenueSlugs.value = []
  }

  function persist(venues: FilterVenue[] | undefined) {
    if (import.meta.server) return
    try {
      localStorage.setItem(STORAGE_KEY, serializeFilters(filters.value))
    } catch {
      // Storage can be unavailable
    }
    const url = new URL(window.location.href)
    url.search = mergeFilterQuery(url.search, filtersToQuery(filters.value, venues ?? []))
    // History API directly, since a router navigation resets scroll
    window.history.replaceState(window.history.state, '', url.toString())
  }

  function clearMapFilter() {
    mapFilteredVenueIds.value = null
    mapCenter.value = null
    try {
      localStorage.removeItem(MAP_BOUNDS_KEY)
    } catch {
      // Storage can be unavailable
    }
  }

  function resetFilters(currentRegionSlug?: string) {
    filters.value = {
      ...defaultFilterState(),
      selectedRegions: currentRegionSlug ? [currentRegionSlug] : [],
    }
    clearMapFilter()
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage can be unavailable
    }
  }

  // For the "search all events" hint: drop everything but the search and location
  function clearFiltersKeepSearch() {
    const { searchQuery, selectedRegions, selectedCities } = filters.value
    filters.value = { ...defaultFilterState(), searchQuery, selectedRegions, selectedCities }
    clearMapFilter()
  }

  function onMapVisibleVenues(ids: string[], venues: FilterVenue[]) {
    const withCoords = venues.filter(v => v.latitude && v.longitude).length
    // Showing nearly every venue counts as no map filter, so zooming out clears it
    if (withCoords === 0 || ids.length / withCoords > 0.9) {
      mapFilteredVenueIds.value = null
      return
    }
    mapFilteredVenueIds.value = ids
    filters.value = { ...filters.value, selectedVenueIds: filters.value.selectedVenueIds.filter(id => ids.includes(id)) }
  }

  function onMapCenterChanged(center: MapCenter, venues: FilterVenue[]) {
    mapCenter.value = center
    updateRegion(center.lat, center.lng)
    // In 'view' mode the map reports visible venues through onMapVisibleVenues
    if (center.radius === 'view') return
    const ids = venuesWithinRadius(venues, center, center.radius)
    mapFilteredVenueIds.value = ids
    filters.value = { ...filters.value, selectedVenueIds: filters.value.selectedVenueIds.filter(id => ids.includes(id)) }
  }

  return {
    filters,
    mapFilteredVenueIds,
    mapCenter,
    pendingVenueSlugs,
    restored,
    regionAutoSelected,
    apiFilters,
    isRestoring,
    restore,
    resolvePendingVenues,
    persist,
    resetFilters,
    clearFiltersKeepSearch,
    onMapVisibleVenues,
    onMapCenterChanged,
    clearMapFilter,
  }
}
