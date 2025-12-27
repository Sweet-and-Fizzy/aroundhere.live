<script setup lang="ts">
import { nextTick, toRef } from 'vue'
import { today, getLocalTimeZone } from '@internationalized/date'
import type { DateRange } from 'reka-ui'

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
      selectedGenres: selectedGenres.value,
      selectedEventTypes: selectedEventTypes.value,
      searchQuery: searchQuery.value,
      myEvents: myEvents.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  }
}

const savedFilters = loadSavedFilters()

// Date range state - default to 'month' for more events
const datePreset = ref(savedFilters?.datePreset || 'month')
const customDateRange = ref<CalendarDateRange | undefined>(undefined)
const showCalendar = ref(false)

// Location filter - now tracks selections at Region, City, and Venue levels separately
const selectedRegions = ref<string[]>(savedFilters?.selectedRegions || [])
const selectedCities = ref<string[]>(savedFilters?.selectedCities || [])
const selectedVenueIds = ref<string[]>(savedFilters?.selectedVenueIds || [])
const searchQuery = ref(savedFilters?.searchQuery || '')
const selectedGenres = ref<{ label: string; value: string }[]>(savedFilters?.selectedGenres || [])
// Multi-select for event types - default to All Music
const selectedEventTypes = ref<{ label: string; value: string }[]>(
  savedFilters?.selectedEventTypes || [{ label: 'All Music', value: 'ALL_MUSIC' }]
)

// My Events filter - 'interested', 'going', 'all', or null (disabled)
const myEvents = ref<string | null>(savedFilters?.myEvents || null)

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
    selectedEventTypes.value[0]?.value !== 'ALL_MUSIC' ||
    datePreset.value !== 'month' ||
    mapFilteredVenueIds.value !== null ||
    myEvents.value !== null
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
  selectedEventTypes.value = [{ label: 'All Music', value: 'ALL_MUSIC' }]
  datePreset.value = 'month'
  customDateRange.value = undefined
  mapFilteredVenueIds.value = null
  myEvents.value = null
  if (import.meta.client) {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(MAP_BOUNDS_KEY)
  }
  applyFilters()
}

// Music-related event types (for "All Music" selection)
const musicEventTypes = [
  { label: 'Live Music', value: 'MUSIC' },
  { label: 'DJ Sets', value: 'DJ' },
  { label: 'Open Mic', value: 'OPEN_MIC' },
  { label: 'Karaoke', value: 'KARAOKE' },
]

// Non-music event types
const nonMusicEventTypes = [
  { label: 'Comedy', value: 'COMEDY' },
  { label: 'Theater', value: 'THEATER' },
  { label: 'Games', value: 'GAMES' },
  { label: 'Dance', value: 'DANCE' },
  { label: 'Market', value: 'MARKET' },
  { label: 'Workshop', value: 'WORKSHOP' },
  { label: 'Party', value: 'PARTY' },
  { label: 'Fitness', value: 'FITNESS' },
  { label: 'Drag', value: 'DRAG' },
]

// Event type options - includes common non-music events
const eventTypeItems = [
  { label: 'All Events', value: 'ALL_EVENTS' },
  { label: 'All Music', value: 'ALL_MUSIC' },
  ...musicEventTypes,
  ...nonMusicEventTypes,
]

const datePresets = [
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This Weekend', value: 'weekend' },
  { label: 'Next 7 Days', value: 'week' },
  { label: 'Next 30 Days', value: 'month' },
  { label: 'All Upcoming', value: 'all' },
]

// My Events filter options
const myEventsItems = [
  { label: 'All My Events', value: 'all' },
  { label: 'Interested', value: 'interested' },
  { label: 'Going', value: 'going' },
]

const genreItems = computed(() =>
  (props.genres?.map(g => ({
    label: props.genreLabels?.[g] || g.charAt(0).toUpperCase() + g.slice(1),
    value: g
  })) ?? [])
)

// Custom labels for multi-selects
const locationLabel = computed(() => {
  // Show summary of selected regions, cities, or venues
  if (selectedRegions.value.length === 0 && selectedCities.value.length === 0 && selectedVenueIds.value.length === 0) {
    return 'Location'
  }
  return locationSummary.value || 'Location'
})

const genreLabel = computed(() => {
  if (selectedGenres.value.length === 0) return 'Genre'

  // Filter out any undefined values
  const validGenres = selectedGenres.value.filter(g => g?.label)

  if (validGenres.length === 0) return 'Genre'
  if (validGenres.length === 1) return validGenres[0].label
  if (validGenres.length === 2) {
    return `${validGenres[0].label}, ${validGenres[1].label}`
  }
  return `${validGenres[0].label} and ${validGenres.length - 1} more`
})

const eventTypeLabel = computed(() => {
  if (selectedEventTypes.value.length === 0) return 'Type'

  // Filter out any undefined values
  const validTypes = selectedEventTypes.value.filter(t => t?.label)

  if (validTypes.length === 0) return 'Type'
  if (validTypes.length === 1) return validTypes[0].label
  if (validTypes.length === 2) {
    return `${validTypes[0].label}, ${validTypes[1].label}`
  }
  return `${validTypes[0].label} and ${validTypes.length - 1} more`
})

// Get today's CalendarDate
const todayDate = computed(() => today(getLocalTimeZone()))

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
  return datePresets.find(p => p.value === datePreset.value)?.label || 'Select Date'
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

  // Get event types from multi-select
  let eventTypes = selectedEventTypes.value.map(e => e.value).filter(Boolean)

  // ALL_EVENTS means no filtering by type
  const showAllEvents = eventTypes.includes('ALL_EVENTS')

  // ALL_MUSIC means filter by isMusic=true (don't expand to specific types)
  const showAllMusic = eventTypes.includes('ALL_MUSIC')

  // If ALL_MUSIC is selected, don't send specific event types
  // Instead, rely on musicOnly=true to filter by isMusic field
  if (showAllMusic && !showAllEvents) {
    // Remove ALL_MUSIC from the list, keep any other specific types
    eventTypes = eventTypes.filter(t => t !== 'ALL_MUSIC')
  }

  // Determine musicOnly flag
  // - ALL_EVENTS: musicOnly=false (show all events)
  // - ALL_MUSIC: musicOnly=true (show only music events via isMusic field)
  // - Specific types: musicOnly=undefined (let specific types determine results)
  const musicOnly = showAllEvents ? false : (showAllMusic && eventTypes.length === 0) ? true : undefined

  const filters = {
    startDate,
    endDate,
    regions: selectedRegions.value.length > 0 ? selectedRegions.value : undefined,
    cities: selectedCities.value.length > 0 ? selectedCities.value : undefined,
    venueIds: venueIds && venueIds.length > 0 ? venueIds : undefined,
    q: searchQuery.value || undefined,
    genres: selectedGenres.value.length > 0 ? selectedGenres.value.map(g => g.value) : undefined,
    eventTypes: (!showAllEvents && eventTypes.length > 0) ? eventTypes : undefined,
    musicOnly,
    myEvents: myEvents.value || undefined,
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

function selectDatePreset(preset: string) {
  datePreset.value = preset
  showCalendar.value = false
  applyFilters()
}

function closeCalendar() {
  showCalendar.value = false
}

// Auto-apply on changes
watch([selectedRegions, selectedCities, selectedVenueIds, selectedGenres, selectedEventTypes, myEvents], () => {
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
          icon="i-heroicons-magnifying-glass"
          size="md"
          class="w-full"
          :ui="{ base: 'text-gray-900 border-gray-400' }"
        />
      </div>

      <!-- Row 2: Type + Genre + My Events -->
      <div class="flex gap-2">
        <!-- Event Type Filter -->
        <div class="flex-1 min-w-0">
          <USelectMenu
            v-model="selectedEventTypes"
            :items="eventTypeItems"
            multiple
            class="w-full"
            :ui="{ base: 'text-gray-900 border-gray-400' }"
          >
            <template #default>
              <span>{{ eventTypeLabel }}</span>
            </template>
            <template #leading>
              <UIcon
                name="i-heroicons-tag"
                class="w-4 h-4"
              />
            </template>
            <template #trailing>
              <UButton
                v-if="selectedEventTypes.length > 0"
                icon="i-heroicons-x-mark"
                size="xs"
                color="neutral"
                variant="ghost"
                @click.stop="selectedEventTypes = []"
              />
            </template>
          </USelectMenu>
        </div>

        <!-- Genre Filter -->
        <div
          v-if="genres?.length"
          class="flex-1 min-w-0"
        >
          <USelectMenu
            v-model="selectedGenres"
            :items="genreItems"
            multiple
            class="w-full"
            :ui="{ base: 'text-gray-900 border-gray-400', content: 'w-64' }"
          >
            <template #default>
              <span>{{ genreLabel }}</span>
            </template>
            <template #leading>
              <UIcon
                name="i-heroicons-musical-note"
                class="w-4 h-4"
              />
            </template>
            <template #trailing>
              <UButton
                v-if="selectedGenres.length > 0"
                icon="i-heroicons-x-mark"
                size="xs"
                color="neutral"
                variant="ghost"
                @click.stop="selectedGenres = []"
              />
            </template>
          </USelectMenu>
        </div>

        <!-- My Events Filter (only when logged in) -->
        <div
          v-if="loggedIn"
          class="flex-shrink-0"
        >
          <UPopover>
            <UButton
              :color="myEvents ? 'primary' : 'neutral'"
              :variant="myEvents ? 'soft' : 'outline'"
              icon="i-heroicons-star"
              class="whitespace-nowrap"
            >
              {{ myEvents ? myEventsItems.find(i => i.value === myEvents)?.label || 'My Events' : 'My Events' }}
            </UButton>
            <template #content>
              <div class="p-2 space-y-1 w-40">
                <button
                  v-for="item in myEventsItems"
                  :key="item.value"
                  class="w-full text-left px-3 py-2 text-sm rounded-md transition-colors"
                  :class="myEvents === item.value
                    ? 'bg-primary-100 text-primary-700 font-medium'
                    : 'hover:bg-gray-100 text-gray-700'"
                  @click="myEvents = item.value"
                >
                  {{ item.label }}
                </button>
                <button
                  v-if="myEvents"
                  class="w-full text-left px-3 py-2 text-sm rounded-md text-gray-500 hover:bg-gray-100 border-t mt-1 pt-2"
                  @click="myEvents = null"
                >
                  Clear filter
                </button>
              </div>
            </template>
          </UPopover>
        </div>
      </div>

      <!-- Row 3: Location (Full Width) -->
      <div
        v-if="venuesByRegion.length || venuesByCity.length"
        class="location-row"
      >
        <UPopover v-model:open="locationPopoverOpen">
          <UButton
            color="neutral"
            variant="outline"
            class="w-full justify-between"
            trailing-icon="i-heroicons-chevron-down"
          >
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <UIcon
                name="i-heroicons-map-pin"
                class="w-4 h-4 flex-shrink-0"
              />
              <span class="truncate">{{ locationLabel }}</span>
              <UButton
                v-if="selectedRegions.length > 0 || selectedCities.length > 0 || selectedVenueIds.length > 0"
                icon="i-heroicons-x-mark"
                size="xs"
                color="neutral"
                variant="ghost"
                class="ml-auto flex-shrink-0"
                @click.stop="selectedRegions = []; selectedCities = []; selectedVenueIds = []"
              />
            </div>
          </UButton>

          <template #content>
            <div class="p-2 max-h-96 overflow-y-auto w-80">
              <!-- Multi-region: show Region → City → Venue hierarchy -->
              <template v-if="venuesByRegion.length > 1">
                <div
                  v-for="{ region, cities, totalEvents } in venuesByRegion"
                  :key="region"
                  class="mb-2"
                >
                  <!-- Region Header with Checkbox -->
                  <label class="region-header">
                    <input
                      type="checkbox"
                      :checked="isRegionFullySelected(region)"
                      :indeterminate="isRegionPartiallySelected(region)"
                      class="checkbox"
                      @change="toggleRegionSelection(region)"
                    >
                    <button
                      class="flex-1 flex items-center gap-2"
                      @click.prevent="expandedRegions.has(region) ? expandedRegions.delete(region) : expandedRegions.add(region)"
                    >
                      <UIcon
                        :name="expandedRegions.has(region) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                        class="w-4 h-4 text-gray-500"
                      />
                      <span class="font-medium text-sm text-gray-700">{{ region }}</span>
                      <span class="text-xs text-gray-500 ml-auto">({{ totalEvents }} events)</span>
                    </button>
                  </label>

                  <!-- Cities under this region -->
                  <div
                    v-if="expandedRegions.has(region)"
                    class="ml-6 mt-1 space-y-1"
                  >
                    <div
                      v-for="{ city, venues: cityVenues, totalEvents: cityTotal } in cities"
                      :key="city"
                      class="mb-1"
                    >
                      <!-- City Header with Checkbox -->
                      <label class="city-header">
                        <input
                          type="checkbox"
                          :checked="isCityFullySelected(city)"
                          :indeterminate="isCityPartiallySelected(city)"
                          class="checkbox"
                          @change="toggleCitySelection(city)"
                        >
                        <button
                          class="flex-1 flex items-center gap-2"
                          @click.prevent="expandedCities.has(city) ? expandedCities.delete(city) : expandedCities.add(city)"
                        >
                          <UIcon
                            :name="expandedCities.has(city) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                            class="w-3 h-3 text-gray-400"
                          />
                          <span class="text-sm font-medium text-gray-600">{{ city }}</span>
                          <span class="text-xs text-gray-400 ml-auto">({{ cityTotal }})</span>
                        </button>
                      </label>

                      <!-- Venues under this city -->
                      <div
                        v-if="expandedCities.has(city)"
                        class="ml-6 mt-1 space-y-1"
                      >
                        <label
                          v-for="venue in cityVenues"
                          :key="venue.id"
                          class="venue-checkbox-label"
                        >
                          <input
                            type="checkbox"
                            :checked="selectedVenueIds.includes(venue.id)"
                            class="checkbox"
                            @change="selectedVenueIds.includes(venue.id) ? selectedVenueIds.splice(selectedVenueIds.indexOf(venue.id), 1) : selectedVenueIds.push(venue.id)"
                          >
                          <span class="text-sm">{{ venue.name }}</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Single region: show City → Venue hierarchy directly -->
              <template v-else>
                <div
                  v-for="{ city, venues: cityVenues, totalEvents: cityTotal } in venuesByCity"
                  :key="city"
                  class="mb-2"
                >
                  <!-- City Header with Checkbox -->
                  <label class="city-header">
                    <input
                      type="checkbox"
                      :checked="isCityFullySelected(city)"
                      :indeterminate="isCityPartiallySelected(city)"
                      class="checkbox"
                      @change="toggleCitySelection(city)"
                    >
                    <button
                      class="flex-1 flex items-center gap-2"
                      @click.prevent="expandedCities.has(city) ? expandedCities.delete(city) : expandedCities.add(city)"
                    >
                      <UIcon
                        :name="expandedCities.has(city) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                        class="w-4 h-4 text-gray-500"
                      />
                      <span class="font-medium text-sm text-gray-700">{{ city }}</span>
                      <span class="text-xs text-gray-500 ml-auto">({{ cityTotal }} events)</span>
                    </button>
                  </label>

                  <!-- Venues under this city -->
                  <div
                    v-if="expandedCities.has(city)"
                    class="ml-6 mt-1 space-y-1"
                  >
                    <label
                      v-for="venue in cityVenues"
                      :key="venue.id"
                      class="venue-checkbox-label"
                    >
                      <input
                        type="checkbox"
                        :checked="selectedVenueIds.includes(venue.id)"
                        class="checkbox"
                        @change="selectedVenueIds.includes(venue.id) ? selectedVenueIds.splice(selectedVenueIds.indexOf(venue.id), 1) : selectedVenueIds.push(venue.id)"
                      >
                      <span class="text-sm">{{ venue.name }}</span>
                    </label>
                  </div>
                </div>
              </template>
            </div>
          </template>
        </UPopover>
      </div>

      <!-- Row 3: Date Filter -->
      <div class="flex gap-2">
        <UPopover
          v-model:open="showCalendar"
          class="flex-1"
        >
          <UButton
            color="neutral"
            variant="outline"
            class="w-full justify-between"
            trailing-icon="i-heroicons-chevron-down"
          >
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <UIcon
                name="i-heroicons-calendar"
                class="w-4 h-4 flex-shrink-0"
              />
              <span class="truncate text-sm">{{ dateDisplayLabel }}</span>
              <UButton
                v-if="datePreset !== 'month'"
                icon="i-heroicons-x-mark"
                size="xs"
                color="neutral"
                variant="ghost"
                class="ml-auto flex-shrink-0"
                @click.stop="datePreset = 'month'; customDateRange = undefined"
              />
            </div>
          </UButton>

          <template #content>
            <div class="p-3 space-y-3 w-[calc(100vw-2rem)] max-w-80">
              <div class="flex flex-wrap gap-1.5 sm:gap-2">
                <button
                  v-for="preset in datePresets"
                  :key="preset.value"
                  class="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm rounded-md transition-colors"
                  :class="datePreset === preset.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'"
                  @click="selectDatePreset(preset.value)"
                >
                  {{ preset.label }}
                </button>
              </div>

              <div class="border-t pt-3">
                <p class="text-sm text-gray-600 mb-2">
                  Or select a custom range:
                </p>
                <UCalendar
                  v-model="customDateRange"
                  range
                  :min-value="todayDate"
                  :number-of-months="1"
                />
                <p
                  v-if="customDateRange?.start && customDateRange?.end"
                  class="text-xs text-primary-600 mt-2 font-medium"
                >
                  {{ customDateRange.start.month }}/{{ customDateRange.start.day }} - {{ customDateRange.end.month }}/{{ customDateRange.end.day }}
                </p>
              </div>

              <div class="flex justify-end">
                <UButton
                  size="sm"
                  @click="closeCalendar"
                >
                  Done
                </UButton>
              </div>
            </div>
          </template>
        </UPopover>
      </div>

      <!-- Row 4: Map Filter (Accordion) -->
      <UAccordion
        v-if="venues?.length"
        v-model="mapAccordionOpen"
        :items="[{ label: 'Filter by Map', icon: 'i-heroicons-map', slot: 'map' }]"
        class="map-accordion"
      >
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
            name="i-heroicons-x-mark"
            class="w-4 h-4 mr-1"
          />
          Reset All Filters
          <span
            v-if="activeFilterCount > 0"
            class="ml-1 text-xs opacity-75"
          >({{ activeFilterCount }})</span>
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
