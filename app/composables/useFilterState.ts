/**
 * Composable for managing event filter state with URL sync and localStorage persistence.
 * Used by EventFilters, EventFiltersSidebar, and other filter components.
 */

import { readonly, type Ref } from 'vue'
import type {
  FilterState,
  DatePreset,
  EventTypeSelection,
  MyEventsOption,
  VenueRef,
} from '~/types/filters'
import {
  ALL_EVENT_TYPE_SELECTIONS,
  DATE_PRESETS,
  MY_EVENTS_OPTIONS,
  DEFAULT_FILTER_STATE,
} from '~/types/filters'

// Re-export types for convenience
export type { FilterState, DatePreset, EventTypeSelection, MyEventsOption }

export interface UseFilterStateOptions {
  /** localStorage key for persistence */
  storageKey?: string
  /** Default date preset */
  defaultDatePreset?: DatePreset
  /** Default event types */
  defaultEventTypes?: EventTypeSelection[]
  /** Whether to sync filters to URL */
  syncToUrl?: boolean
  /** Venues list for slug lookups */
  venues?: Ref<VenueRef[] | undefined>
}

/**
 * Format date as YYYY-MM-DD for URLs
 */
export function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse date from YYYY-MM-DD format
 */
export function parseDateParam(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(parseInt(match[1]!), parseInt(match[2]!) - 1, parseInt(match[3]!))
}

export function useFilterState(options: UseFilterStateOptions = {}) {
  const {
    storageKey = 'eventFilters',
    defaultDatePreset = 'all',
    defaultEventTypes = ['ALL_MUSIC'],
    syncToUrl = true,
    venues,
  } = options

  const route = useRoute()

  // Filter state refs
  const searchQuery = ref<string>(DEFAULT_FILTER_STATE.searchQuery)
  const datePreset = ref<DatePreset | string>(defaultDatePreset)
  const selectedRegions = ref<string[]>([])
  const selectedCities = ref<string[]>([])
  const selectedVenueIds = ref<string[]>([])
  const selectedGenres = ref<string[]>([])
  const selectedEventTypes = ref<EventTypeSelection[]>(defaultEventTypes)
  const filterByFavoriteArtists = ref<boolean>(false)
  const filterByFavoriteVenues = ref<boolean>(false)
  const filterByFavoriteGenres = ref<boolean>(false)
  const myEvents = ref<MyEventsOption | null>(null)
  const expandedSection = ref<string | null>(null)

  const isLoaded = ref(false)

  /**
   * Load filters from URL query parameters
   */
  function loadFromUrl(): Partial<FilterState> | null {
    const query = route.query
    const hasUrlFilters = query.q || query.venues || query.genres || query.types ||
                          query.date || query.cities || query.regions || query.myEvents

    if (!hasUrlFilters) return null

    const filters: Partial<FilterState> = {}

    if (query.q) {
      filters.searchQuery = query.q as string
    }
    if (query.regions) {
      filters.selectedRegions = (query.regions as string).split(',')
    }
    if (query.cities) {
      filters.selectedCities = (query.cities as string).split(',')
    }
    if (query.venues) {
      // Venues in URL are slugs, need to map to IDs later
      const slugs = (query.venues as string).split(',')
      if (venues?.value) {
        filters.selectedVenueIds = slugs
          .map(slug => venues.value?.find(v => v.slug === slug)?.id)
          .filter((id): id is string => !!id)
      }
    }
    if (query.genres) {
      filters.selectedGenres = (query.genres as string).split(',')
    }
    if (query.types) {
      const types = (query.types as string).split(',')
      filters.selectedEventTypes = types.filter(t =>
        ALL_EVENT_TYPE_SELECTIONS.includes(t as EventTypeSelection)
      ) as EventTypeSelection[]
      if (filters.selectedEventTypes.length === 0) {
        filters.selectedEventTypes = defaultEventTypes
      }
    }
    if (query.date) {
      const date = query.date as string
      filters.datePreset = DATE_PRESETS.includes(date as DatePreset) ? date as DatePreset : defaultDatePreset
    }
    if (query.myEvents) {
      const myEventsVal = query.myEvents as string
      filters.myEvents = MY_EVENTS_OPTIONS.includes(myEventsVal as MyEventsOption)
        ? myEventsVal as MyEventsOption
        : null
    }

    return filters
  }

  /**
   * Load filters from localStorage
   */
  function loadFromStorage(): Partial<FilterState> | null {
    if (!import.meta.client) return null

    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return null

      const data = JSON.parse(saved)

      // Migrate old format if needed
      if (data.selectedEventTypes && Array.isArray(data.selectedEventTypes)) {
        // Handle old format with {label, value} objects
        if (data.selectedEventTypes[0]?.value) {
          data.selectedEventTypes = data.selectedEventTypes.map((t: { value: string }) => t.value)
        }
        // Migrate individual music types to ALL_MUSIC
        const musicTypes = ['MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE']
        const hasOnlyMusicTypes = data.selectedEventTypes.every((t: string) => musicTypes.includes(t))
        if (hasOnlyMusicTypes && data.selectedEventTypes.length > 0) {
          data.selectedEventTypes = ['ALL_MUSIC']
        }
      }
      if (data.selectedGenres && Array.isArray(data.selectedGenres)) {
        // Handle old format with {label, value} objects
        if (data.selectedGenres[0]?.value) {
          data.selectedGenres = data.selectedGenres.map((g: { value: string }) => g.value)
        }
      }

      return data
    } catch {
      localStorage.removeItem(storageKey)
      return null
    }
  }

  /**
   * Save current filter state to localStorage
   */
  function saveToStorage(): void {
    if (!import.meta.client) return

    const state: FilterState = {
      searchQuery: searchQuery.value,
      datePreset: datePreset.value,
      selectedRegions: selectedRegions.value,
      selectedCities: selectedCities.value,
      selectedVenueIds: selectedVenueIds.value,
      selectedGenres: selectedGenres.value,
      selectedEventTypes: selectedEventTypes.value,
      filterByFavoriteArtists: filterByFavoriteArtists.value,
      filterByFavoriteVenues: filterByFavoriteVenues.value,
      filterByFavoriteGenres: filterByFavoriteGenres.value,
      myEvents: myEvents.value,
      expandedSection: expandedSection.value,
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch (e) {
      console.warn('Failed to save filters to localStorage:', e)
    }
  }

  /**
   * Update URL with current filters (for shareable links)
   */
  function updateUrl(): void {
    if (!import.meta.client || !syncToUrl) return

    const query: Record<string, string> = {}

    if (searchQuery.value) {
      query.q = searchQuery.value
    }
    if (selectedRegions.value.length > 0) {
      query.regions = selectedRegions.value.join(',')
    }
    if (selectedCities.value.length > 0) {
      query.cities = selectedCities.value.join(',')
    }
    if (selectedVenueIds.value.length > 0 && venues?.value) {
      const slugs = selectedVenueIds.value
        .map(id => venues.value?.find(v => v.id === id)?.slug)
        .filter((slug): slug is string => !!slug)
      if (slugs.length > 0) {
        query.venues = slugs.join(',')
      }
    }
    if (selectedGenres.value.length > 0) {
      query.genres = selectedGenres.value.join(',')
    }
    if (selectedEventTypes.value.length > 0 &&
        !(selectedEventTypes.value.length === 1 && selectedEventTypes.value[0] === 'ALL_MUSIC')) {
      query.types = selectedEventTypes.value.join(',')
    }
    if (datePreset.value !== 'all') {
      query.date = datePreset.value
    }
    if (myEvents.value) {
      query.myEvents = myEvents.value
    }

    // Use History API directly to avoid Vue Router navigation
    const url = new URL(window.location.href)
    url.search = new URLSearchParams(query).toString()
    window.history.replaceState({}, '', url.toString())
  }

  /**
   * Apply loaded filters to state
   */
  function applyFilters(filters: Partial<FilterState>): void {
    if (filters.searchQuery !== undefined) searchQuery.value = filters.searchQuery
    if (filters.datePreset !== undefined) datePreset.value = filters.datePreset
    if (filters.selectedRegions !== undefined) selectedRegions.value = filters.selectedRegions
    if (filters.selectedCities !== undefined) selectedCities.value = filters.selectedCities
    if (filters.selectedVenueIds !== undefined) selectedVenueIds.value = filters.selectedVenueIds
    if (filters.selectedGenres !== undefined) selectedGenres.value = filters.selectedGenres
    if (filters.selectedEventTypes !== undefined) selectedEventTypes.value = filters.selectedEventTypes
    if (filters.filterByFavoriteArtists !== undefined) filterByFavoriteArtists.value = filters.filterByFavoriteArtists
    if (filters.filterByFavoriteVenues !== undefined) filterByFavoriteVenues.value = filters.filterByFavoriteVenues
    if (filters.filterByFavoriteGenres !== undefined) filterByFavoriteGenres.value = filters.filterByFavoriteGenres
    if (filters.myEvents !== undefined) myEvents.value = filters.myEvents
    if (filters.expandedSection !== undefined) expandedSection.value = filters.expandedSection
  }

  /**
   * Reset all filters to defaults
   */
  function resetFilters(): void {
    searchQuery.value = DEFAULT_FILTER_STATE.searchQuery
    datePreset.value = defaultDatePreset
    selectedRegions.value = []
    selectedCities.value = []
    selectedVenueIds.value = []
    selectedGenres.value = []
    selectedEventTypes.value = defaultEventTypes
    filterByFavoriteArtists.value = false
    filterByFavoriteVenues.value = false
    filterByFavoriteGenres.value = false
    myEvents.value = null
    saveToStorage()
    updateUrl()
  }

  /**
   * Get filter object for API calls
   */
  function getFilterParams(): Record<string, unknown> {
    return {
      q: searchQuery.value || undefined,
      regions: selectedRegions.value.length > 0 ? selectedRegions.value : undefined,
      cities: selectedCities.value.length > 0 ? selectedCities.value : undefined,
      venueIds: selectedVenueIds.value.length > 0 ? selectedVenueIds.value : undefined,
      genres: selectedGenres.value.length > 0 ? selectedGenres.value : undefined,
      eventTypes: selectedEventTypes.value.length > 0 ? selectedEventTypes.value : undefined,
      datePreset: datePreset.value !== 'all' ? datePreset.value : undefined,
      myEvents: myEvents.value || undefined,
      filterByFavoriteArtists: filterByFavoriteArtists.value || undefined,
      filterByFavoriteVenues: filterByFavoriteVenues.value || undefined,
      filterByFavoriteGenres: filterByFavoriteGenres.value || undefined,
    }
  }

  /**
   * Check if any filters are active
   */
  const hasActiveFilters = computed(() => {
    return searchQuery.value !== '' ||
      selectedRegions.value.length > 0 ||
      selectedCities.value.length > 0 ||
      selectedVenueIds.value.length > 0 ||
      selectedGenres.value.length > 0 ||
      (selectedEventTypes.value.length > 0 &&
       !(selectedEventTypes.value.length === 1 && selectedEventTypes.value[0] === 'ALL_MUSIC')) ||
      datePreset.value !== 'all' ||
      myEvents.value !== null ||
      filterByFavoriteArtists.value ||
      filterByFavoriteVenues.value ||
      filterByFavoriteGenres.value
  })

  // Initialize on mount
  onMounted(() => {
    // URL takes priority, then localStorage
    const urlFilters = loadFromUrl()
    const storageFilters = loadFromStorage()

    if (urlFilters) {
      applyFilters(urlFilters)
    } else if (storageFilters) {
      applyFilters(storageFilters)
    }

    isLoaded.value = true
  })

  // Auto-save when filters change
  watch(
    [searchQuery, datePreset, selectedRegions, selectedCities, selectedVenueIds,
     selectedGenres, selectedEventTypes, filterByFavoriteArtists, filterByFavoriteVenues,
     filterByFavoriteGenres, myEvents, expandedSection],
    () => {
      if (isLoaded.value) {
        saveToStorage()
        updateUrl()
      }
    },
    { deep: true }
  )

  return {
    // State refs
    searchQuery,
    datePreset,
    selectedRegions,
    selectedCities,
    selectedVenueIds,
    selectedGenres,
    selectedEventTypes,
    filterByFavoriteArtists,
    filterByFavoriteVenues,
    filterByFavoriteGenres,
    myEvents,
    expandedSection,
    isLoaded: readonly(isLoaded),

    // Computed
    hasActiveFilters,

    // Methods
    saveToStorage,
    updateUrl,
    resetFilters,
    getFilterParams,
    applyFilters,
  }
}
