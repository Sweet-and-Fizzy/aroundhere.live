<script setup lang="ts">
import { nextTick, toRef } from 'vue'
import type { DateRange } from 'reka-ui'

// Import filter sub-components
import ForYouFilter from '~/components/filters/ForYouFilter.vue'
import MyEventsFilter from '~/components/filters/MyEventsFilter.vue'
import LocationFilter from '~/components/filters/LocationFilter.vue'
import DateRangeFilter from '~/components/filters/DateRangeFilter.vue'
import EventTypeFilter from '~/components/filters/EventTypeFilter.vue'
import GenreFilter from '~/components/filters/GenreFilter.vue'

type CalendarDateRange = DateRange | any

// Format date as YYYY-MM-DD for cleaner URLs (using local date components)
function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const { updateRegion, region: currentRegion, loaded: regionLoaded } = useCurrentRegion()
const { loggedIn } = useUserSession()
const { favorites } = useFavorites()

const emit = defineEmits<{
  filter: [filters: Record<string, any>]
}>()

const props = defineProps<{
  venues?: { id: string; name: string; slug: string; latitude?: number | null; longitude?: number | null; city?: string | null }[]
  genres?: string[]
  genreLabels?: Record<string, string>
  cities?: string[]
  facets?: {
    venueCounts: Record<string, number>
    genreCounts: Record<string, number>
    typeCounts: Record<string, number>
    cityCounts: Record<string, number>
    cityRegions: Record<string, string>
    musicCount: number
    nonMusicCount: number
  }
}>()

// LocalStorage key for persisting filters
const STORAGE_KEY = 'eventFilters'

// Load filters from URL parameters first, fall back to localStorage
function loadSavedFilters() {
  if (import.meta.client) {
    const route = useRoute()
    const urlParams = route.query

    // If URL has any filter params, load from URL and ignore localStorage
    if (Object.keys(urlParams).length > 0) {
      const filters: any = {}

      if (urlParams.regions && typeof urlParams.regions === 'string') {
        filters.selectedRegions = urlParams.regions.split(',')
      }
      if (urlParams.cities && typeof urlParams.cities === 'string') {
        filters.selectedCities = urlParams.cities.split(',')
      }
      if (urlParams.venueIds && typeof urlParams.venueIds === 'string') {
        filters.selectedVenueIds = urlParams.venueIds.split(',')
      }
      if (urlParams.genres && typeof urlParams.genres === 'string') {
        const genreValues = urlParams.genres.split(',')
        filters.selectedGenres = genreValues.map(g => ({ label: g, value: g }))
      }
      if (urlParams.eventTypes && typeof urlParams.eventTypes === 'string') {
        const typeValues = urlParams.eventTypes.split(',')
        filters.selectedEventTypes = typeValues.map(t => ({ label: t, value: t }))
      }
      if (urlParams.q && typeof urlParams.q === 'string') {
        filters.searchQuery = urlParams.q
      }
      if (urlParams.myEvents && typeof urlParams.myEvents === 'string') {
        filters.myEvents = urlParams.myEvents
      }

      // Only return if we found actual filter values
      if (Object.keys(filters).length > 0) {
        return filters
      }
    }

    // Fall back to localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const filters = JSON.parse(saved)
        // Migration: If savedEventTypes contains individual music types (MUSIC, DJ, etc.),
        // replace them with ALL_MUSIC
        if (filters.selectedEventTypes) {
          const types = filters.selectedEventTypes.map((t: any) => t.value)
          const musicTypes = ['MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE']
          const hasOnlyMusicTypes = types.length > 0 && types.every((t: string) => musicTypes.includes(t))
          if (hasOnlyMusicTypes) {
            filters.selectedEventTypes = [{ label: 'All Music', value: 'ALL_MUSIC' }]
          }
        }
        return filters
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null
}

// Save filters to localStorage
function saveFilters() {
  if (import.meta.client) {
    const filters = {
      datePreset: datePreset.value,
      selectedRegions: selectedRegions.value,
      selectedCities: selectedCities.value,
      selectedVenueIds: selectedVenueIds.value,
      // Store as string arrays (new format)
      selectedGenres: selectedGenres.value,
      selectedEventTypes: selectedEventTypes.value,
      searchQuery: searchQuery.value,
      myEvents: myEvents.value,
      recommended: recommended.value,
      filterByFavoriteArtists: filterByFavoriteArtists.value,
      filterByFavoriteVenues: filterByFavoriteVenues.value,
      filterByFavoriteGenres: filterByFavoriteGenres.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  }
}

const savedFilters = loadSavedFilters()

// Date range state - default to 'all' for all upcoming events
const datePreset = ref(savedFilters?.datePreset || 'all')
const customDateRange = ref<CalendarDateRange | undefined>(undefined)

// Location filter - now tracks selections at Region, City, and Venue levels separately
const selectedRegions = ref<string[]>(savedFilters?.selectedRegions || [])
const selectedCities = ref<string[]>(savedFilters?.selectedCities || [])
const selectedVenueIds = ref<string[]>(savedFilters?.selectedVenueIds || [])
const searchQuery = ref(savedFilters?.searchQuery || '')
// Store as plain string arrays for sub-component compatibility
const selectedGenres = ref<string[]>(
  savedFilters?.selectedGenres?.map((g: any) => typeof g === 'string' ? g : g.value) || []
)
// Multi-select for event types - default to All Music
const selectedEventTypes = ref<string[]>(
  savedFilters?.selectedEventTypes?.map((t: any) => typeof t === 'string' ? t : t.value) || ['ALL_MUSIC']
)

// My Events filter - 'interested', 'going', 'all', or null (disabled)
const myEvents = ref<string | null>(savedFilters?.myEvents || null)

// Recommended filter (part of "For You" section)
const recommended = ref(savedFilters?.recommended || false)

// Favorites filters - separate toggles for artists, venues, and genres
const filterByFavoriteArtists = ref(savedFilters?.filterByFavoriteArtists || false)
const filterByFavoriteVenues = ref(savedFilters?.filterByFavoriteVenues || false)
const filterByFavoriteGenres = ref(savedFilters?.filterByFavoriteGenres || false)

// Check if user has any favorites
const hasFavorites = computed(() => {
  return favorites.value.artists.length > 0 ||
    favorites.value.venues.length > 0 ||
    favorites.value.genres.length > 0
})

// Check if any "For You" filter is active (recommended or favorites)
const hasActiveForYouFilter = computed(() => {
  return recommended.value || filterByFavoriteArtists.value || filterByFavoriteVenues.value || filterByFavoriteGenres.value
})

// Summary for "For You" filter button
const forYouSummary = computed(() => {
  const parts: string[] = []
  if (recommended.value) parts.push('Recommended')
  if (filterByFavoriteArtists.value) parts.push('Artists')
  if (filterByFavoriteVenues.value) parts.push('Venues')
  if (filterByFavoriteGenres.value) parts.push('Genres')
  return parts.length > 0 ? parts.join(', ') : null
})

// Labels for saved events filter
const savedEventsLabels: Record<string, string> = {
  all: 'All Saved',
  interested: 'Interested',
  going: 'Going',
}

// Use the location filter composable for hierarchical Region → City → Venue selection
const {
  venuesByRegion,
  venuesByCity,
  locationSummary,
  expandedRegions,
  expandedCities,
  isCityFullySelected,
  isCityPartiallySelected,
  toggleCitySelection,
  isRegionFullySelected,
  isRegionPartiallySelected,
  toggleRegionSelection,
} = useLocationFilter(
  toRef(props, 'venues'),
  toRef(props, 'facets'),
  selectedRegions,
  selectedCities,
  selectedVenueIds
)

const locationPopoverOpen = ref(false)

// Map filter state
const mapFilteredVenueIds = ref<string[] | null>(null)
const mapAccordionOpen = ref<string | undefined>(undefined)
const mapCenter = ref<{ lat: number; lng: number; radius: number | 'view' } | null>(null)

// Shared localStorage key for map bounds (used across all pages)
const MAP_BOUNDS_KEY = 'mapBounds'

// Venues with coordinates for the map
const venuesWithCoords = computed(() =>
  props.venues?.filter(v => v.latitude && v.longitude) || []
)

// Calculate distance between two points in miles (Haversine formula)
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Filter venues by radius from center
function filterVenuesByRadius() {
  if (!mapCenter.value) {
    mapFilteredVenueIds.value = null
    return
  }

  const { lat, lng, radius } = mapCenter.value
  const venuesInRadius = venuesWithCoords.value.filter(v => {
    if (!v.latitude || !v.longitude) return false
    // Only filter by radius if it's a number (not 'view')
    if (typeof radius === 'number') {
      const distance = getDistanceMiles(lat, lng, v.latitude, v.longitude)
      return distance <= radius
    }
    return true // If radius is 'view', include all venues
  })

  mapFilteredVenueIds.value = venuesInRadius.map(v => v.id)
}

function onMapVisibleVenues(venueIds: string[]) {
  // Use viewport filtering when in 'view' mode
  if (mapCenter.value?.radius === 'view') {
    mapFilteredVenueIds.value = venueIds
    applyFilters()
  }
}

// Track if map has been customized (search, locate, etc.)
const mapHasCustomCenter = computed(() => mapCenter.value !== null)

function onMapCenterChanged(center: { lat: number; lng: number; radius: number | 'view' }) {
  mapCenter.value = center
  // Update global region based on map center
  updateRegion(center.lat, center.lng)
  if (center.radius === 'view') {
    // In view mode, clear radius filter - will be set by onMapVisibleVenues
    // But we need to trigger a filter update immediately based on current view
    // The map's moveend/zoomend will call onMapVisibleVenues
    mapFilteredVenueIds.value = null
    applyFilters()
  } else {
    filterVenuesByRadius()
    applyFilters()
  }
}

function resetMap() {
  mapFilteredVenueIds.value = null
  mapCenter.value = null
  // Clear persisted map bounds to trigger reset on next render
  if (import.meta.client) {
    localStorage.removeItem(MAP_BOUNDS_KEY)
  }
  // Force map to re-render by toggling the accordion
  const wasOpen = mapAccordionOpen.value
  mapAccordionOpen.value = undefined
  nextTick(() => {
    mapAccordionOpen.value = wasOpen
  })
  applyFilters()
}

// Check if any filters are active (different from defaults)
const hasActiveFilters = computed(() => {
  return (
    searchQuery.value !== '' ||
    selectedRegions.value.length > 0 ||
    selectedCities.value.length > 0 ||
    selectedVenueIds.value.length > 0 ||
    selectedGenres.value.length > 0 ||
    selectedEventTypes.value.length !== 1 ||
    selectedEventTypes.value[0] !== 'ALL_MUSIC' ||
    datePreset.value !== 'all' ||
    mapFilteredVenueIds.value !== null ||
    myEvents.value !== null ||
    hasActiveForYouFilter.value
  )
})

// Reset all filters to defaults
function resetFilters() {
  searchQuery.value = ''
  // Reset to current region as the default
  selectedRegions.value = currentRegion.value?.slug ? [currentRegion.value.slug] : []
  selectedCities.value = []
  selectedVenueIds.value = []
  selectedGenres.value = []
  selectedEventTypes.value = ['ALL_MUSIC']
  datePreset.value = 'all'
  customDateRange.value = undefined
  mapFilteredVenueIds.value = null
  myEvents.value = null
  recommended.value = false
  filterByFavoriteArtists.value = false
  filterByFavoriteVenues.value = false
  filterByFavoriteGenres.value = false
  if (import.meta.client) {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(MAP_BOUNDS_KEY)
  }
  applyFilters()
}

// Date preset labels for display
const datePresetLabels: Record<string, string> = {
  all: 'All Dates',
  today: 'Today',
  tomorrow: 'Tomorrow',
  weekend: 'This Weekend',
  week: 'This Week',
  month: 'This Month',
  custom: 'Custom',
}


// Custom labels for multi-selects
const locationLabel = computed(() => {
  // Show summary of selected regions, cities, or venues
  if (selectedRegions.value.length === 0 && selectedCities.value.length === 0 && selectedVenueIds.value.length === 0) {
    return 'Location'
  }
  return locationSummary.value || 'Location'
})

// Use label composables for formatting
const { getGenreLabel } = useGenreLabels()
const { getEventTypeLabel } = useEventTypeLabels()

const genreLabel = computed(() => {
  if (selectedGenres.value.length === 0) return 'Genre'

  const validGenres = selectedGenres.value.filter(Boolean)
  if (validGenres.length === 0) return 'Genre'

  const first = validGenres[0]!
  const firstLabel = getGenreLabel(first)
  if (validGenres.length === 1) return firstLabel
  if (validGenres.length === 2) {
    return `${firstLabel}, ${getGenreLabel(validGenres[1]!)}`
  }
  return `${firstLabel} and ${validGenres.length - 1} more`
})

const eventTypeLabel = computed(() => {
  if (selectedEventTypes.value.length === 0) return 'Type'

  const validTypes = selectedEventTypes.value.filter(Boolean)
  if (validTypes.length === 0) return 'Type'

  const first = validTypes[0]!
  const firstLabel = getEventTypeLabel(first)
  if (validTypes.length === 1) return firstLabel
  if (validTypes.length === 2) {
    return `${firstLabel}, ${getEventTypeLabel(validTypes[1]!)}`
  }
  return `${firstLabel} and ${validTypes.length - 1} more`
})


// Display label for date selection
const dateDisplayLabel = computed(() => {
  if (datePreset.value === 'custom' && customDateRange.value) {
    const start = customDateRange.value.start
    const end = customDateRange.value.end
    if (start && end) {
      const startStr = `${start.month}/${start.day}`
      const endStr = `${end.month}/${end.day}`
      return `${startStr} - ${endStr}`
    }
  }
  return datePresetLabels[datePreset.value] || 'Select Date'
})

function getDateRange(range: string) {
  const now = new Date()
  const startDate = new Date(now)
  startDate.setHours(0, 0, 0, 0)

  let endDate: Date | undefined

  switch (range) {
    case 'today':
      endDate = new Date(startDate)
      endDate.setHours(23, 59, 59, 999)
      break
    case 'tomorrow':
      startDate.setDate(startDate.getDate() + 1)
      endDate = new Date(startDate)
      endDate.setHours(23, 59, 59, 999)
      break
    case 'weekend': {
      const dayOfWeek = now.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
        // Already weekend
      } else {
        const daysUntilFriday = 5 - dayOfWeek
        startDate.setDate(now.getDate() + daysUntilFriday)
      }
      const endDayOfWeek = startDate.getDay()
      const daysUntilSunday = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + daysUntilSunday)
      endDate.setHours(23, 59, 59, 999)
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
      if (customDateRange.value) {
        const start = customDateRange.value.start
        const end = customDateRange.value.end
        if (start && end) {
          return {
            startDate: formatDateParam(new Date(start.year, start.month - 1, start.day)),
            endDate: formatDateParam(new Date(end.year, end.month - 1, end.day)),
          }
        }
      }
      break
    case 'all':
      // No end date
      break
  }

  return {
    startDate: formatDateParam(startDate),
    endDate: endDate ? formatDateParam(endDate) : undefined,
  }
}

function applyFilters() {
  const { startDate, endDate } = getDateRange(datePreset.value)

  // Combine location filter (selectedVenueIds) and map filters
  // If both are set, use intersection; if only one, use that one
  let venueIds: string[] | undefined
  if (selectedVenueIds.value.length > 0 && mapFilteredVenueIds.value !== null) {
    // Intersection of both filters
    venueIds = selectedVenueIds.value.filter(id => mapFilteredVenueIds.value!.includes(id))
  } else if (selectedVenueIds.value.length > 0) {
    venueIds = selectedVenueIds.value
  } else if (mapFilteredVenueIds.value !== null) {
    venueIds = mapFilteredVenueIds.value
  }

  // Get event types from multi-select (already string array)
  let eventTypes = [...selectedEventTypes.value]

  // Empty array means show all events (no filtering by type)
  const showAllEvents = eventTypes.length === 0

  // ALL_MUSIC means filter by isMusic=true
  const showAllMusic = eventTypes.includes('ALL_MUSIC')

  // OTHER_EVENTS means filter by isMusic=false (non-music events only)
  const showOtherEvents = eventTypes.includes('OTHER_EVENTS')

  // Remove meta-types from the list - they're handled via musicOnly/nonMusicOnly
  eventTypes = eventTypes.filter(t => t !== 'ALL_MUSIC' && t !== 'OTHER_EVENTS')

  // Determine musicOnly and nonMusicOnly flags
  // - showAllEvents (empty selection): musicOnly=false (show all events)
  // - ALL_MUSIC only: musicOnly=true (show only music events)
  // - OTHER_EVENTS only: nonMusicOnly=true (show only non-music events)
  // - Specific types: let event types determine results
  let musicOnly: boolean | undefined = undefined
  let nonMusicOnly: boolean | undefined = undefined

  if (showAllEvents) {
    musicOnly = false
  } else if (showAllMusic && !showOtherEvents && eventTypes.length === 0) {
    musicOnly = true
  } else if (showOtherEvents && !showAllMusic && eventTypes.length === 0) {
    nonMusicOnly = true
  } else if (eventTypes.length > 0) {
    // Specific event types selected - don't filter by music/non-music
    musicOnly = false
  }

  // Get favorite IDs if favorites filters are enabled
  const favoriteArtistIds = filterByFavoriteArtists.value && favorites.value.artists.length > 0
    ? favorites.value.artists.map(a => a.id)
    : undefined
  const favoriteVenueIds = filterByFavoriteVenues.value && favorites.value.venues.length > 0
    ? favorites.value.venues.map(v => v.id)
    : undefined
  const favoriteGenreSlugs = filterByFavoriteGenres.value && favorites.value.genres.length > 0
    ? favorites.value.genres
    : undefined

  const filters = {
    startDate,
    endDate,
    regions: selectedRegions.value.length > 0 ? selectedRegions.value : undefined,
    cities: selectedCities.value.length > 0 ? selectedCities.value : undefined,
    venueIds: venueIds && venueIds.length > 0 ? venueIds : undefined,
    q: searchQuery.value || undefined,
    genres: selectedGenres.value.length > 0 ? selectedGenres.value : undefined,
    eventTypes: (!showAllEvents && eventTypes.length > 0) ? eventTypes : undefined,
    musicOnly,
    nonMusicOnly,
    // My Events filter - 'recommended' if recommended is active, otherwise attendance status
    myEvents: recommended.value ? 'recommended' : (myEvents.value || undefined),
    favoriteArtistIds,
    favoriteVenueIds,
    favoriteGenres: favoriteGenreSlugs,
  }

  emit('filter', filters)

  // Update URL with filter parameters
  updateUrlFromFilters(filters)

  // Save filters to localStorage
  saveFilters()
}

// Sync filters to URL query parameters
function updateUrlFromFilters(filters: Record<string, any>) {
  if (!import.meta.client) return

  const router = useRouter()
  const query: Record<string, string> = {}

  // Add filters to query params
  if (filters.regions?.length) query.regions = filters.regions.join(',')
  if (filters.cities?.length) query.cities = filters.cities.join(',')
  if (filters.venueIds?.length) query.venueIds = filters.venueIds.join(',')
  if (filters.genres?.length) query.genres = filters.genres.join(',')
  if (filters.eventTypes?.length) query.eventTypes = filters.eventTypes.join(',')
  if (filters.q) query.q = filters.q
  if (filters.startDate) query.startDate = filters.startDate
  if (filters.endDate) query.endDate = filters.endDate
  if (filters.myEvents) query.myEvents = filters.myEvents

  // Only update if query changed
  const currentQuery = router.currentRoute.value.query
  const queryChanged = Object.keys(query).some(key => query[key] !== currentQuery[key]) ||
    Object.keys(currentQuery).some(key => query[key] !== currentQuery[key])

  if (queryChanged) {
    // Use history.replaceState directly to avoid scroll behavior from Vue Router
    if (import.meta.client && window.history) {
      const url = new URL(window.location.href)
      url.search = new URLSearchParams(query).toString()
      window.history.replaceState(window.history.state, '', url.toString())
    }
  }
}

// Watch for complete range selection (both start and end dates selected)
watch(customDateRange, (newRange) => {
  if (newRange?.start && newRange?.end) {
    datePreset.value = 'custom'
    applyFilters()
  }
}, { deep: true })


// Auto-apply on changes
watch([selectedRegions, selectedCities, selectedVenueIds, selectedGenres, selectedEventTypes, myEvents, recommended, filterByFavoriteArtists, filterByFavoriteVenues, filterByFavoriteGenres], () => {
  applyFilters()
}, { deep: true })

// Debounce search input
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(applyFilters, 300)
})

// Get events state to check if data already exists
const { events: existingEvents } = useEvents()

// Initial filter application
onMounted(() => {
  // Only fetch if no events exist (events persist via useState across navigations)
  if (existingEvents.value.length === 0) {
    applyFilters()
  }

  // Initialize region from saved map bounds or default center
  if (import.meta.client) {
    try {
      const savedBounds = localStorage.getItem(MAP_BOUNDS_KEY)
      if (savedBounds) {
        const bounds = JSON.parse(savedBounds)
        // Calculate center from bounds (format: { north, south, east, west })
        const centerLat = (bounds.north + bounds.south) / 2
        const centerLng = (bounds.east + bounds.west) / 2
        updateRegion(centerLat, centerLng, true)
      } else {
        // Use default center (Northampton area)
        updateRegion(42.32, -72.63, true)
      }
    } catch {
      // Fallback to default center
      updateRegion(42.32, -72.63, true)
    }
  }
})

// Auto-select current region when it's loaded and no region is explicitly selected
// This ensures first-time users see events from their detected region
watch(regionLoaded, (loaded) => {
  if (loaded && currentRegion.value?.slug && selectedRegions.value.length === 0 && selectedCities.value.length === 0 && selectedVenueIds.value.length === 0) {
    selectedRegions.value = [currentRegion.value.slug]
    applyFilters()
  }
}, { immediate: true })
</script>

<template>
  <UCard class="mb-4 sm:mb-6">
    <div class="flex flex-col gap-3">
      <!-- Row 1: Search (Full Width) -->
      <div>
        <UInput
          v-model="searchQuery"
          placeholder="Search events, artists..."
          size="md"
          class="w-full"
          :ui="{ base: 'text-gray-900 border-gray-400' }"
        >
          <template #leading>
            <UIcon
              name="i-lucide-search"
              class="w-4 h-4"
            />
          </template>
        </UInput>
      </div>

      <!-- Row 2: Date + Location -->
      <div class="flex gap-2">
        <!-- Date Filter -->
        <UPopover class="flex-1">
          <UButton
            color="neutral"
            :variant="datePreset !== 'all' ? 'soft' : 'outline'"
            class="w-full justify-between"
            trailing-icon="i-lucide-chevron-down"
          >
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <UIcon
                name="i-lucide-calendar"
                class="w-4 h-4 flex-shrink-0"
              />
              <span class="truncate text-sm">{{ dateDisplayLabel }}</span>
            </div>
          </UButton>

          <template #content>
            <div class="p-3 w-[calc(100vw-2rem)] max-w-80">
              <DateRangeFilter
                :model-value="datePreset"
                :custom-range="customDateRange"
                @update:model-value="datePreset = $event; applyFilters()"
                @update:custom-range="customDateRange = $event"
              />
            </div>
          </template>
        </UPopover>

        <!-- Location Filter -->
        <div
          v-if="venuesByRegion.length || venuesByCity.length"
          class="flex-1 min-w-0"
        >
          <UPopover v-model:open="locationPopoverOpen">
            <UButton
              color="neutral"
              :variant="selectedRegions.length > 0 || selectedCities.length > 0 || selectedVenueIds.length > 0 ? 'soft' : 'outline'"
              class="w-full justify-between"
              trailing-icon="i-lucide-chevron-down"
            >
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <UIcon
                  name="i-lucide-map-pin"
                  class="w-4 h-4 flex-shrink-0"
                />
                <span class="truncate">{{ locationLabel }}</span>
                <UButton
                  v-if="selectedRegions.length > 0 || selectedCities.length > 0 || selectedVenueIds.length > 0"
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="ml-auto flex-shrink-0"
                  @click.stop="selectedRegions = []; selectedCities = []; selectedVenueIds = []"
                />
              </div>
            </UButton>

            <template #content>
              <div class="p-2 w-80">
                <LocationFilter
                  :venues-by-region="venuesByRegion"
                  :venues-by-city="venuesByCity"
                  :all-venues="props.venues"
                  :selected-regions="selectedRegions"
                  :selected-cities="selectedCities"
                  :selected-venue-ids="selectedVenueIds"
                  :expanded-regions="expandedRegions"
                  :expanded-cities="expandedCities"
                  :is-region-fully-selected="isRegionFullySelected"
                  :is-region-partially-selected="isRegionPartiallySelected"
                  :is-city-fully-selected="isCityFullySelected"
                  :is-city-partially-selected="isCityPartiallySelected"
                  :facets="props.facets"
                  :show-venues="true"
                  :show-search="true"
                  @toggle-region="region => expandedRegions.has(region) ? expandedRegions.delete(region) : expandedRegions.add(region)"
                  @toggle-region-selection="toggleRegionSelection"
                  @toggle-city="city => expandedCities.has(city) ? expandedCities.delete(city) : expandedCities.add(city)"
                  @toggle-city-selection="toggleCitySelection"
                  @toggle-venue="venueId => selectedVenueIds.includes(venueId) ? selectedVenueIds.splice(selectedVenueIds.indexOf(venueId), 1) : selectedVenueIds.push(venueId)"
                  @select-venue="venueId => { if (!selectedVenueIds.includes(venueId)) selectedVenueIds.push(venueId) }"
                  @remove-venue="venueId => selectedVenueIds.splice(selectedVenueIds.indexOf(venueId), 1)"
                />
              </div>
            </template>
          </UPopover>
        </div>
      </div>

      <!-- Row 3: Map Filter (Accordion) -->
      <UAccordion
        v-if="venues?.length"
        v-model="mapAccordionOpen"
        :items="[{ label: 'Filter by Map', slot: 'map' }]"
        class="map-accordion"
      >
        <template #leading>
          <UIcon
            name="i-lucide-map"
            class="w-4 h-4"
          />
        </template>
        <template #map>
          <div class="p-2">
            <ClientOnly>
              <VenueMap
                :venues="venuesWithCoords"
                :persist-key="MAP_BOUNDS_KEY"
                :show-controls="true"
                @visible-venues="onMapVisibleVenues"
                @center-changed="onMapCenterChanged"
              />
            </ClientOnly>
            <div class="flex items-center justify-between mt-2">
              <p
                v-if="mapFilteredVenueIds !== null"
                class="text-xs text-gray-600"
              >
                Showing events from {{ mapFilteredVenueIds.length }} venue{{ mapFilteredVenueIds.length === 1 ? '' : 's' }} in view
              </p>
              <span v-else />
              <UButton
                v-if="mapFilteredVenueIds !== null || mapHasCustomCenter"
                size="xs"
                color="neutral"
                variant="outline"
                @click="resetMap"
              >
                Reset Map
              </UButton>
            </div>
          </div>
        </template>
      </UAccordion>

      <!-- Row 4: Type + Genre -->
      <div class="flex gap-2 justify-end">
        <!-- Event Type Filter -->
        <div class="flex-1 min-w-0">
          <UPopover>
            <UButton
              color="neutral"
              :variant="selectedEventTypes.length > 0 && selectedEventTypes[0] !== 'ALL_MUSIC' ? 'soft' : 'outline'"
              trailing-icon="i-lucide-chevron-down"
              class="w-full justify-between"
            >
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <UIcon
                  name="i-lucide-tag"
                  class="w-4 h-4 flex-shrink-0"
                />
                <span class="truncate">{{ eventTypeLabel }}</span>
              </div>
            </UButton>
            <template #content>
              <div class="p-3 w-64">
                <EventTypeFilter
                  :model-value="selectedEventTypes"
                  :facets="props.facets"
                  @update:model-value="selectedEventTypes = $event"
                />
              </div>
            </template>
          </UPopover>
        </div>

        <!-- Genre Filter -->
        <div
          v-if="genres?.length"
          class="flex-1 min-w-0"
        >
          <UPopover>
            <UButton
              color="neutral"
              :variant="selectedGenres.length > 0 ? 'soft' : 'outline'"
              trailing-icon="i-lucide-chevron-down"
              class="w-full justify-between"
            >
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <UIcon
                  name="i-lucide-music"
                  class="w-4 h-4 flex-shrink-0"
                />
                <span class="truncate">{{ genreLabel }}</span>
              </div>
            </UButton>
            <template #content>
              <div class="p-3 w-64">
                <GenreFilter
                  :model-value="selectedGenres"
                  :genres="props.genres"
                  :genre-labels="props.genreLabels"
                  :facets="props.facets"
                  @update:model-value="selectedGenres = $event"
                />
              </div>
            </template>
          </UPopover>
        </div>
      </div>

      <!-- Row 5: For You + Saved Events (only when logged in) -->
      <div
        v-if="loggedIn"
        class="flex gap-2 justify-end"
      >
        <!-- For You Filter -->
        <div
          v-if="hasFavorites"
          class="flex-1 min-w-0"
        >
          <UPopover>
            <UButton
              color="neutral"
              :variant="hasActiveForYouFilter ? 'soft' : 'outline'"
              trailing-icon="i-lucide-chevron-down"
              class="w-full justify-between"
            >
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <UIcon
                  name="i-lucide-sparkles"
                  class="w-4 h-4 flex-shrink-0"
                />
                <span class="truncate">{{ forYouSummary || 'For You' }}</span>
              </div>
            </UButton>
            <template #content>
              <div class="p-2 w-56">
                <ForYouFilter
                  :recommended="recommended"
                  :filter-by-artists="filterByFavoriteArtists"
                  :filter-by-venues="filterByFavoriteVenues"
                  :filter-by-genres="filterByFavoriteGenres"
                  :artist-count="favorites.artists.length"
                  :venue-count="favorites.venues.length"
                  :genre-count="favorites.genres.length"
                  @update:recommended="recommended = $event"
                  @update:filter-by-artists="filterByFavoriteArtists = $event"
                  @update:filter-by-venues="filterByFavoriteVenues = $event"
                  @update:filter-by-genres="filterByFavoriteGenres = $event"
                />
              </div>
            </template>
          </UPopover>
        </div>

        <!-- Saved Events Filter -->
        <div class="flex-1 min-w-0">
          <UPopover>
            <UButton
              color="neutral"
              :variant="myEvents ? 'soft' : 'outline'"
              trailing-icon="i-lucide-chevron-down"
              class="w-full justify-between"
            >
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <UIcon
                  name="i-lucide-bookmark"
                  class="w-4 h-4 flex-shrink-0"
                />
                <span class="truncate">{{ myEvents ? savedEventsLabels[myEvents] || 'Saved' : 'Saved' }}</span>
              </div>
            </UButton>
            <template #content>
              <div class="p-2 w-48">
                <MyEventsFilter
                  :model-value="myEvents"
                  @update:model-value="myEvents = $event"
                />
              </div>
            </template>
          </UPopover>
        </div>
      </div>

      <!-- Reset All Button -->
      <div
        v-if="hasActiveFilters"
        class="flex justify-center"
      >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          @click="resetFilters"
        >
          <UIcon
            name="i-lucide-x"
            class="w-4 h-4 mr-1"
          />
          Reset All Filters
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<style scoped>
/* Ensure grid layout works */
.filter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

@media (min-width: 640px) {
  .filter-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.75rem;
  }
}

/* Location row takes full width */
.location-row {
  display: block;
  width: 100%;
}


/* Force black text and borders on form controls for better contrast */
:deep(input),
:deep(button[role="combobox"]),
:deep([data-part="trigger"]) {
  color: #000000 !important;
  border-color: #9ca3af !important;
}

:deep(input::placeholder) {
  color: #6b7280 !important;
  opacity: 1 !important;
}

/* Make select trigger text black */
:deep(.filter-select button span) {
  color: #000000 !important;
}

/* Fix map accordion trigger height and border to match other controls */
.map-accordion {
  border: 1px solid #111827 !important;
  border-radius: 0.375rem;
}

.map-accordion :deep(button[data-state]) {
  padding: 0.5rem 0.75rem;
  min-height: 2.5rem;
  border-color: #111827 !important;
}

.map-accordion :deep(button[data-state] span) {
  font-size: 0.875rem;
  color: #111827;
}

/* Region header styling */
.region-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 0.375rem;
  transition: background-color 0.15s;
  text-align: left;
}

.region-header button {
  text-align: left;
  justify-content: flex-start;
}

.region-header:hover {
  background: #f3f4f6;
}

/* City header styling (for hierarchical view) */
.city-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.5rem;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
  text-align: left;
}

.city-header:hover {
  background: #f9fafb;
}

/* City checkbox label (legacy - for simple city list) */
.city-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
  text-align: left;
}

.city-checkbox-label:hover {
  background: #f9fafb;
}

/* Venue checkbox label */
.venue-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
  text-align: left;
}

.venue-checkbox-label:hover {
  background: #f9fafb;
}

.checkbox {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
  flex-shrink: 0;
}
</style>
