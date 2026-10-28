<script setup lang="ts">
import { nextTick, toRef } from 'vue'
import type { DateRange } from 'reka-ui'
import { isDefaultEventTypes, type EventFilterState } from '~/lib/eventFilters'

// Import filter sub-components
import ForYouFilter from '~/components/filters/ForYouFilter.vue'
import MyEventsFilter from '~/components/filters/MyEventsFilter.vue'
import LocationFilter from '~/components/filters/LocationFilter.vue'
import DateRangeFilter from '~/components/filters/DateRangeFilter.vue'
import EventTypeFilter from '~/components/filters/EventTypeFilter.vue'
import GenreFilter from '~/components/filters/GenreFilter.vue'

type CalendarDateRange = DateRange | any

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
  // Only the panel visible at the current breakpoint applies filters
  active: boolean
}>()

const {
  filters,
  mapFilteredVenueIds,
  mapCenter,
  apiFilters,
  isRestoring,
  restore,
  persist,
  resetFilters: resetSharedFilters,
  clearFiltersKeepSearch,
  onMapVisibleVenues: setMapVisibleVenues,
  onMapCenterChanged: setMapCenter,
  clearMapFilter,
} = useEventFilters()

// Writable view of one field of the shared filter state
function filterField<K extends keyof EventFilterState>(key: K) {
  return computed<EventFilterState[K]>({
    get: () => filters.value[key],
    set: (value) => {
      filters.value = { ...filters.value, [key]: value }
    },
  })
}

const datePreset = filterField('datePreset')
const customDateRange = computed<CalendarDateRange | undefined>({
  get: () => filters.value.customDateRange ?? undefined,
  set: (value) => {
    filters.value = { ...filters.value, customDateRange: value?.start && value?.end ? value : null }
  },
})
const selectedRegions = filterField('selectedRegions')
const selectedCities = filterField('selectedCities')
const selectedVenueIds = filterField('selectedVenueIds')
const searchQuery = filterField('searchQuery')
const selectedGenres = filterField('selectedGenres')
const selectedEventTypes = filterField('selectedEventTypes')
const myEvents = filterField('myEvents')
const recommended = filterField('recommended')
const filterByFavoriteArtists = filterField('filterByFavoriteArtists')
const filterByFavoriteVenues = filterField('filterByFavoriteVenues')
const filterByFavoriteGenres = filterField('filterByFavoriteGenres')

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
// Shared localStorage key for map bounds (used across all pages)
const MAP_BOUNDS_KEY = 'mapBounds'
const mapAccordionOpen = ref<string | undefined>(undefined)

// Venues with coordinates for the map
const venuesWithCoords = computed(() =>
  props.venues?.filter(v => v.latitude && v.longitude) || []
)

function onMapVisibleVenues(venueIds: string[]) {
  setMapVisibleVenues(venueIds, venuesWithCoords.value)
  applyFilters()
}

// Track if map has been customized (search, locate, etc.)
const mapHasCustomCenter = computed(() => mapCenter.value !== null)

function onMapCenterChanged(center: { lat: number; lng: number; radius: number | 'view' }) {
  setMapCenter(center, venuesWithCoords.value)
  applyFilters()
}

function resetMap() {
  clearMapFilter()
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
    !isDefaultEventTypes(selectedEventTypes.value) ||
    datePreset.value !== 'all' ||
    mapFilteredVenueIds.value !== null ||
    myEvents.value !== null ||
    hasActiveForYouFilter.value
  )
})

// Reset all filters to defaults, keeping the current region
function resetFilters() {
  resetSharedFilters(currentRegion.value?.slug)
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
      const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
      const startDate = new Date(start.year, start.month - 1, start.day)
      const endDate = new Date(end.year, end.month - 1, end.day)
      return `${formatter.format(startDate)} - ${formatter.format(endDate)}`
    }
  }
  return datePresetLabels[datePreset.value] || 'Select Date'
})

// The same filters can be applied twice in a row (a watcher plus an explicit call),
// so only emit when they change
let lastEmittedFilters = ''

function applyFilters() {
  if (!props.active) return
  persist(props.venues)
  const key = JSON.stringify(apiFilters.value)
  if (key === lastEmittedFilters) return
  lastEmittedFilters = key
  emit('filter', apiFilters.value)
}

// Crossing the breakpoint makes this panel the one the list follows
watch(() => props.active, (active) => {
  if (active) applyFilters()
})

// Watch for complete range selection (both start and end dates selected)
watch(customDateRange, (newRange) => {
  if (isRestoring()) return
  if (newRange?.start && newRange?.end) {
    datePreset.value = 'custom'
    applyFilters()
  }
}, { deep: true })


// Auto-apply on changes
watch([selectedRegions, selectedCities, selectedVenueIds, selectedGenres, selectedEventTypes, myEvents, recommended, filterByFavoriteArtists, filterByFavoriteVenues, filterByFavoriteGenres], () => {
  if (isRestoring()) return
  applyFilters()
}, { deep: true })

// Debounce search input
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  if (isRestoring()) return
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(applyFilters, 300)
})

// Get events state to check if data already exists
const { events: existingEvents } = useEvents()

// Initial filter application
onMounted(() => {
  restore(props.venues)

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

defineExpose({
  clearFiltersKeepSearch,
})
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
              :variant="!isDefaultEventTypes(selectedEventTypes) ? 'soft' : 'outline'"
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
