<script setup lang="ts">
import { nextTick } from 'vue'
import { today, getLocalTimeZone } from '@internationalized/date'
import type { DateRange } from 'reka-ui'

type CalendarDateRange = DateRange | any

const { updateRegion } = useCurrentRegion()

const emit = defineEmits<{
  filter: [filters: Record<string, any>]
}>()

const props = defineProps<{
  venues?: { id: string; name: string; slug: string; latitude?: number | null; longitude?: number | null }[]
  genres?: string[]
  genreLabels?: Record<string, string>
}>()

// LocalStorage key for persisting filters
const STORAGE_KEY = 'eventFilters'

// Load saved filters from localStorage
function loadSavedFilters() {
  if (import.meta.client) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
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
      selectedVenues: selectedVenues.value,
      selectedGenres: selectedGenres.value,
      selectedEventTypes: selectedEventTypes.value,
      searchQuery: searchQuery.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  }
}

const savedFilters = loadSavedFilters()

// Date range state - default to 'month' for more events
const datePreset = ref(savedFilters?.datePreset || 'month')
const customDateRange = ref<CalendarDateRange | undefined>(undefined)
const showCalendar = ref(false)

// Multi-select for venues
const selectedVenues = ref<{ label: string; value: string }[]>(savedFilters?.selectedVenues || [])
const searchQuery = ref(savedFilters?.searchQuery || '')
const selectedGenres = ref<{ label: string; value: string }[]>(savedFilters?.selectedGenres || [])
// Multi-select for event types - default to All Music
const selectedEventTypes = ref<{ label: string; value: string }[]>(
  savedFilters?.selectedEventTypes || [{ label: 'All Music', value: 'ALL_MUSIC' }]
)

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
    selectedVenues.value.length > 0 ||
    selectedGenres.value.length > 0 ||
    selectedEventTypes.value.length !== 1 ||
    selectedEventTypes.value[0]?.value !== 'ALL_MUSIC' ||
    datePreset.value !== 'month' ||
    mapFilteredVenueIds.value !== null
  )
})

// Reset all filters to defaults
function resetFilters() {
  searchQuery.value = ''
  selectedVenues.value = []
  selectedGenres.value = []
  selectedEventTypes.value = [{ label: 'All Music', value: 'ALL_MUSIC' }]
  datePreset.value = 'month'
  customDateRange.value = undefined
  mapFilteredVenueIds.value = null
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

const venueItems = computed(() =>
  (props.venues
    ?.map(v => ({ label: v.name, value: v.id }))
    .sort((a, b) => a.label.localeCompare(b.label)) ?? [])
)

const genreItems = computed(() =>
  (props.genres?.map(g => ({
    label: props.genreLabels?.[g] || g.charAt(0).toUpperCase() + g.slice(1),
    value: g
  })) ?? [])
)

// Custom labels for multi-selects
const venueLabel = computed(() => {
  if (selectedVenues.value.length === 0) return 'Venues'
  if (selectedVenues.value.length === 1) return selectedVenues.value[0]?.label ?? 'Venues'
  return `${selectedVenues.value.length} venues`
})

const genreLabel = computed(() => {
  if (selectedGenres.value.length === 0) return 'Genres'
  if (selectedGenres.value.length === 1) return selectedGenres.value[0]?.label ?? 'Genres'
  return `${selectedGenres.value.length} genres`
})

const eventTypeLabel = computed(() => {
  if (selectedEventTypes.value.length === 0) return 'Types'
  if (selectedEventTypes.value.length === 1) return selectedEventTypes.value[0]?.label ?? 'Types'
  return `${selectedEventTypes.value.length} types`
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
            startDate: new Date(start.year, start.month - 1, start.day).toISOString(),
            endDate: new Date(end.year, end.month - 1, end.day, 23, 59, 59, 999).toISOString(),
          }
        }
      }
      break
    case 'all':
      // No end date
      break
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate?.toISOString(),
  }
}

function applyFilters() {
  const { startDate, endDate } = getDateRange(datePreset.value)

  // Get venue IDs from multi-select dropdown
  const dropdownVenueIds = selectedVenues.value.map(v => v.value).filter(Boolean)

  // Combine dropdown and map filters
  // If both are set, use intersection; if only one, use that one
  let venueIds: string[] | undefined
  if (dropdownVenueIds.length > 0 && mapFilteredVenueIds.value !== null) {
    // Intersection of both filters
    venueIds = dropdownVenueIds.filter(id => mapFilteredVenueIds.value!.includes(id))
  } else if (dropdownVenueIds.length > 0) {
    venueIds = dropdownVenueIds
  } else if (mapFilteredVenueIds.value !== null) {
    venueIds = mapFilteredVenueIds.value
  }

  // Get event types from multi-select
  let eventTypes = selectedEventTypes.value.map(e => e.value).filter(Boolean)

  // ALL_EVENTS means no filtering by type
  const showAllEvents = eventTypes.includes('ALL_EVENTS')

  // Expand ALL_MUSIC to all music-related types
  if (!showAllEvents && eventTypes.includes('ALL_MUSIC')) {
    const otherTypes = eventTypes.filter(t => t !== 'ALL_MUSIC')
    const musicTypes = musicEventTypes.map(t => t.value)
    eventTypes = [...new Set([...musicTypes, ...otherTypes])]
  }

  // If no event types selected or ALL_EVENTS, show all events (including non-music)
  const musicOnly = (eventTypes.length === 0 || showAllEvents) ? false : undefined

  emit('filter', {
    startDate,
    endDate,
    venueIds: venueIds && venueIds.length > 0 ? venueIds : undefined,
    q: searchQuery.value || undefined,
    genres: selectedGenres.value.length > 0 ? selectedGenres.value.map(g => g.value) : undefined,
    eventTypes: (!showAllEvents && eventTypes.length > 0) ? eventTypes : undefined,
    musicOnly,
  })

  // Save filters to localStorage
  saveFilters()
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
watch([selectedVenues, selectedGenres, selectedEventTypes], () => {
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
</script>

<template>
  <UCard class="mb-4 sm:mb-6">
    <div class="flex flex-col gap-3">
      <!-- Row 1: Search, Venues, Genre, Type -->
      <div class="filter-grid">
        <!-- Search -->
        <div class="search-col">
          <UInput
            v-model="searchQuery"
            placeholder="Search events, artists..."
            icon="i-heroicons-magnifying-glass"
            size="md"
            class="w-full"
            :ui="{ base: 'text-gray-900 border-gray-400' }"
          />
        </div>

        <!-- Venue Filter -->
        <div v-if="venues?.length">
          <USelectMenu
            v-model="selectedVenues"
            :items="venueItems"
            multiple
            class="w-full filter-select"
            :ui="{ base: 'text-gray-900 border-gray-400', content: 'w-64' }"
          >
            <template #default>
              <span>{{ venueLabel }}</span>
            </template>
            <template #leading>
              <UIcon
                name="i-heroicons-map-pin"
                class="w-4 h-4"
              />
            </template>
          </USelectMenu>
        </div>

        <!-- Genre Filter -->
        <div v-if="genres?.length">
          <USelectMenu
            v-model="selectedGenres"
            :items="genreItems"
            multiple
            class="w-full filter-select"
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
          </USelectMenu>
        </div>

        <!-- Event Type Filter -->
        <div>
          <USelectMenu
            v-model="selectedEventTypes"
            :items="eventTypeItems"
            multiple
            class="w-full filter-select"
            :ui="{ base: 'text-gray-900 border-gray-400' }"
          >
            <template #default>
              <span>{{ eventTypeLabel }}</span>
            </template>
            <template #leading>
              <UIcon
                name="i-heroicons-sparkles"
                class="w-4 h-4"
              />
            </template>
          </USelectMenu>
        </div>
      </div>

      <!-- Row 2: Date filter and Reset button -->
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
            <UIcon
              name="i-heroicons-calendar"
              class="w-4 h-4 mr-1.5"
            />
            <span class="truncate text-sm">{{ dateDisplayLabel }}</span>
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

        <UButton
          v-if="hasActiveFilters"
          color="neutral"
          variant="outline"
          size="md"
          class="flex-shrink-0"
          @click="resetFilters"
        >
          <UIcon
            name="i-heroicons-x-mark"
            class="w-4 h-4 mr-1"
          />
          Reset
        </UButton>
      </div>

      <!-- Row 3: Map Filter (Accordion) -->
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }
}

@media (min-width: 1024px) {
  .filter-grid {
    /* Search (3) + Venue (1) + Types (1) + Genres (1) = 6 columns */
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

/* Search spans full width on mobile, 2 on tablet, 3 on desktop */
.filter-grid .search-col {
  grid-column: span 2;
}

@media (min-width: 1024px) {
  .filter-grid .search-col {
    grid-column: span 3;
  }
}

/* Force darker text and borders on form controls */
:deep(input),
:deep(button[role="combobox"]),
:deep([data-part="trigger"]) {
  color: #111827 !important;
  border-color: #9ca3af !important;
}

:deep(input::placeholder) {
  color: #111827 !important;
}

/* Make select trigger text darker */
:deep(.filter-select button span) {
  color: #111827 !important;
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
</style>
