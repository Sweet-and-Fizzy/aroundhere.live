<script setup lang="ts">
import { nextTick, toRef } from 'vue'
import type { DateRange } from 'reka-ui'
import { isDefaultEventTypes, type EventFilterState } from '~/lib/eventFilters'

// Import filter sub-components
import FilterSection from '~/components/filters/FilterSection.vue'
import DateRangeFilter from '~/components/filters/DateRangeFilter.vue'
import EventTypeFilter from '~/components/filters/EventTypeFilter.vue'
import GenreFilter from '~/components/filters/GenreFilter.vue'
import ForYouFilter from '~/components/filters/ForYouFilter.vue'
import MyEventsFilter from '~/components/filters/MyEventsFilter.vue'
import LocationFilter from '~/components/filters/LocationFilter.vue'

type CalendarDateRange = DateRange | any

const { region: currentRegion } = useCurrentRegion()

// User session for favorites filter
const { loggedIn } = useUserSession()
const { favorites } = useFavorites()

const props = defineProps<{
  venues?: { id: string; name: string; slug: string; city?: string | null; latitude?: number | null; longitude?: number | null }[]
  genres?: string[]
  genreLabels?: Record<string, string>
  facets?: {
    venueCounts: Record<string, number>
    genreCounts: Record<string, number>
    typeCounts: Record<string, number>
    cityCounts: Record<string, number>
    cityRegions: Record<string, string>
    musicCount: number
    nonMusicCount: number
  }
  resultCount?: number
}>()

// LocalStorage key for persisting filters
const {
  filters,
  mapFilteredVenueIds,
  isRestoring,
  resetFilters: resetSharedFilters,
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

// Which section is open is this panel's own UI state, saved separately from the filters
const SECTION_STORAGE_KEY = 'eventFiltersSection'

// Collapsible sections state - accordion style (only one section open at a time).
// Restored after mount so hydration matches the server render.
const expandedSection = ref<string | null>(null)

function toggleSection(section: string) {
  // Accordion: clicking expanded section collapses it, clicking collapsed expands it (and collapses others)
  if (expandedSection.value === section) {
    expandedSection.value = null
  } else {
    expandedSection.value = section
  }
  try {
    if (expandedSection.value) {
      localStorage.setItem(SECTION_STORAGE_KEY, expandedSection.value)
    } else {
      localStorage.removeItem(SECTION_STORAGE_KEY)
    }
  } catch {
    // Storage can be unavailable
  }
}

function isSectionExpanded(section: string) {
  return expandedSection.value === section
}

// Date range state - default to 'all' since we have pagination
const datePreset = filterField('datePreset')
const customDateRange = computed<CalendarDateRange | undefined>({
  get: () => filters.value.customDateRange ?? undefined,
  set: (value) => {
    filters.value = { ...filters.value, customDateRange: value?.start && value?.end ? value : null }
  },
})
const showCustomCalendar = ref(false)

const selectedVenueIds = filterField('selectedVenueIds')
const searchQuery = filterField('searchQuery')
const selectedGenres = filterField('selectedGenres')
const selectedEventTypes = filterField('selectedEventTypes')
const selectedRegions = filterField('selectedRegions')
const selectedCities = filterField('selectedCities')
const filterByFavoriteArtists = filterField('filterByFavoriteArtists')
const filterByFavoriteVenues = filterField('filterByFavoriteVenues')
const filterByFavoriteGenres = filterField('filterByFavoriteGenres')
const myEvents = filterField('myEvents')
const recommended = filterField('recommended')

// Use location filter composable for hierarchical filtering
const {
  venuesByRegion: locationVenuesByRegion,
  venuesByCity: locationVenuesByCity,
  selectedVenueObjects: locationSelectedVenueObjects,
  locationSummary,
  expandedRegions: locationExpandedRegions,
  expandedCities: locationExpandedCities,
  isCityFullySelected,
  isCityPartiallySelected,
  toggleCitySelection: composableToggleCitySelection,
  isRegionFullySelected,
  isRegionPartiallySelected,
  toggleRegionSelection: composableToggleRegionSelection,
} = useLocationFilter(
  toRef(props, 'venues'),
  toRef(props, 'facets'),
  selectedRegions,
  selectedCities,
  selectedVenueIds
)

// Map filter state
const showMap = ref(false)
const showMapModal = ref(false)

// Shared localStorage key for map bounds
const MAP_BOUNDS_KEY = 'mapBounds'

// Venues with coordinates for the map
const venuesWithCoords = computed(() =>
  props.venues?.filter(v => v.latitude && v.longitude) || []
)

// Filter genres to only show those with events (count > 0) and that would actually narrow results
// Sort alphabetically
const availableGenres = computed(() => {
  const genreCounts = props.facets?.genreCounts ?? {}
  const totalResults = props.resultCount ?? 0
  return (props.genres ?? [])
    .filter((g) => {
      const count = genreCounts[g] ?? 0
      // Must have events AND selecting it would actually narrow results
      // (count < totalResults means it would filter some out)
      // Also show if already selected (so user can deselect)
      return count > 0 && (count < totalResults || selectedGenres.value.includes(g))
    })
    .sort((a, b) => {
      // Sort alphabetically
      return a.localeCompare(b)
    })
})

function onMapVisibleVenues(venueIds: string[]) {
  setMapVisibleVenues(venueIds, venuesWithCoords.value)
}

function onMapCenterChanged(center: { lat: number; lng: number; radius: number | 'view' }) {
  setMapCenter(center, venuesWithCoords.value)
}

function resetMap() {
  clearMapFilter()
  showMap.value = false
  nextTick(() => {
    showMap.value = true
  })
}

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return (
    searchQuery.value !== '' ||
    selectedVenueIds.value.length > 0 ||
    selectedGenres.value.length > 0 ||
    !isDefaultEventTypes(selectedEventTypes.value) ||
    datePreset.value !== 'all' ||
    mapFilteredVenueIds.value !== null ||
    selectedRegions.value.length > 0 ||
    selectedCities.value.length > 0 ||
    filterByFavoriteArtists.value ||
    filterByFavoriteVenues.value ||
    filterByFavoriteGenres.value ||
    recommended.value ||
    myEvents.value !== null
  )
})

// Count active filters for display
const activeFilterCount = computed(() => {
  let count = 0
  if (searchQuery.value !== '') count++
  if (selectedVenueIds.value.length > 0) count++
  if (selectedGenres.value.length > 0) count++
  if (!isDefaultEventTypes(selectedEventTypes.value)) count++
  if (datePreset.value !== 'all') count++
  if (mapFilteredVenueIds.value !== null) count++
  if (selectedRegions.value.length > 0) count++
  if (selectedCities.value.length > 0) count++
  if (filterByFavoriteArtists.value || filterByFavoriteVenues.value || filterByFavoriteGenres.value || recommended.value) count++
  if (myEvents.value !== null) count++
  return count
})

// Reset all filters to defaults, keeping the current region
function resetFilters() {
  resetSharedFilters(currentRegion.value?.slug)
  showMapModal.value = false
}

// Music-related event types
const allMusicEventTypes = [
  { label: 'Live Music', value: 'MUSIC' },
  { label: 'DJ Sets', value: 'DJ' },
  { label: 'Open Mic', value: 'OPEN_MIC' },
  { label: 'Karaoke', value: 'KARAOKE' },
]

// Non-music event types
const allNonMusicEventTypes = [
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

// Filter to only show event types that have events
const musicEventTypes = computed(() => {
  if (!props.facets) return allMusicEventTypes
  return allMusicEventTypes.filter((t) => {
    const count = props.facets?.typeCounts?.[t.value] ?? 0
    // Show if has events OR is already selected
    return count > 0 || selectedEventTypes.value.includes(t.value)
  })
})

const nonMusicEventTypes = computed(() => {
  if (!props.facets) return allNonMusicEventTypes
  return allNonMusicEventTypes.filter((t) => {
    const count = props.facets?.typeCounts?.[t.value] ?? 0
    // Show if has events OR is already selected
    return count > 0 || selectedEventTypes.value.includes(t.value)
  })
})

// Check if any music-related type is selected (for showing genre filter)
const hasMusicTypeSelected = computed(() => {
  // No selection means all events, which includes music
  if (isDefaultEventTypes(selectedEventTypes.value)) return true
  const musicTypes = ['ALL_MUSIC', 'MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE']
  return selectedEventTypes.value.some(t => musicTypes.includes(t))
})

// Show "All Music" only if there are non-music events (so toggling between All Music/All Events matters)
// If nonMusicCount is 0, all matching results are already music, so "All Music" wouldn't change anything
const showAllMusic = computed(() => {
  const nonMusicCount = props.facets?.nonMusicCount ?? 0
  const musicCount = props.facets?.musicCount ?? 0

  // Show only if there are both music AND non-music events (so the toggle matters)
  return musicCount > 0 && nonMusicCount > 0
})

// Show "All Events" only if there are non-music events (meaning All Events differs from All Music)
const showAllEvents = computed(() => {
  const nonMusicCount = props.facets?.nonMusicCount ?? 0
  return nonMusicCount > 0
})

// Check if the entire event type section should be shown
const showEventTypeSection = computed(() => {
  return showAllMusic.value || showAllEvents.value || musicEventTypes.value.length > 0 || nonMusicEventTypes.value.length > 0
})

const datePresets = [
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This Weekend', value: 'weekend' },
  { label: 'Next 7 Days', value: 'week' },
  { label: 'All Upcoming', value: 'all' },
]

// Section summaries for collapsed state
const dateSummary = computed(() => {
  // Show custom date range if selected
  if (datePreset.value === 'custom' && customDateRange.value?.start && customDateRange.value?.end) {
    const start = customDateRange.value.start
    const end = customDateRange.value.end
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    const startDate = new Date(start.year, start.month - 1, start.day)
    const endDate = new Date(end.year, end.month - 1, end.day)
    return `${formatter.format(startDate)} - ${formatter.format(endDate)}`
  }
  const preset = datePresets.find(p => p.value === datePreset.value)
  return preset?.label || 'All Upcoming'
})

// Use locationSummary from composable (which handles regions, cities, and venues)
const venueSummary = locationSummary

const typeSummary = computed(() => {
  if (selectedEventTypes.value.length === 0) return 'All Events'
  if (selectedEventTypes.value.includes('ALL_MUSIC')) {
    if (selectedEventTypes.value.length === 1) return 'All Music'
    const nonMusic = selectedEventTypes.value.filter(t => !['ALL_MUSIC', 'MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE'].includes(t))
    if (nonMusic.length > 0) return 'All Music + more'
    return 'All Music'
  }
  if (selectedEventTypes.value.includes('ALL_NON_MUSIC')) {
    return 'Non-Music'
  }
  const allTypes = [...allMusicEventTypes, ...allNonMusicEventTypes]
  const labels = selectedEventTypes.value
    .map(t => allTypes.find(et => et.value === t)?.label)
    .filter(Boolean)
  if (labels.length <= 2) return labels.join(', ')
  return `${labels[0]} +${labels.length - 1} more`
})

const genreSummary = computed(() => {
  if (selectedGenres.value.length === 0) return null
  const labels = selectedGenres.value.map(g => props.genreLabels?.[g] || g)
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return labels.join(', ')
  return `${labels[0]} +${labels.length - 1} more`
})

// Summary for "For You" section
const forYouSummary = computed(() => {
  const parts: string[] = []
  if (recommended.value) parts.push('Recommended')
  if (filterByFavoriteArtists.value) parts.push('Artists')
  if (filterByFavoriteVenues.value) parts.push('Venues')
  if (filterByFavoriteGenres.value) parts.push('Genres')
  if (parts.length === 0) return null
  return parts.join(', ')
})

// Use venuesByRegion and venuesByCity from composable
const venuesByRegion = locationVenuesByRegion
const venuesByCity = locationVenuesByCity
const expandedRegions = locationExpandedRegions
const expandedCities = locationExpandedCities

function toggleCity(city: string) {
  if (expandedCities.value.has(city)) {
    expandedCities.value.delete(city)
  } else {
    expandedCities.value.add(city)
  }
}

// Wrapper functions around the composable's selection toggles
function toggleCitySelection(city: string) {
  composableToggleCitySelection(city)
}

// Region-level functions
function toggleRegion(region: string) {
  if (expandedRegions.value.has(region)) {
    expandedRegions.value.delete(region)
  } else {
    expandedRegions.value.add(region)
  }
}

function toggleRegionSelection(region: string) {
  composableToggleRegionSelection(region)
}

// Venue search/autocomplete
const venueSearchQuery = ref('')
const showVenueDropdown = ref(false)

// Use selectedVenueObjects from composable
const selectedVenueObjects = locationSelectedVenueObjects

function selectVenueFromSearch(venueId: string) {
  if (!selectedVenueIds.value.includes(venueId)) {
    // Adding a venue - clear region/city filters if this is the first venue selection
    if (selectedVenueIds.value.length === 0) {
      selectedRegions.value = []
      selectedCities.value = []
    }
    selectedVenueIds.value.push(venueId)
  }
  venueSearchQuery.value = ''
  showVenueDropdown.value = false
}

function removeVenue(venueId: string) {
  const index = selectedVenueIds.value.indexOf(venueId)
  if (index !== -1) {
    selectedVenueIds.value.splice(index, 1)
  }
}

// Toggle venue selection
function toggleVenue(venueId: string) {
  const index = selectedVenueIds.value.indexOf(venueId)
  if (index === -1) {
    // Adding a venue - clear region/city filters if this is the first venue selection
    // This prevents confusing AND logic where both broad and specific filters are active
    if (selectedVenueIds.value.length === 0) {
      selectedRegions.value = []
      selectedCities.value = []
    }
    selectedVenueIds.value.push(venueId)
  } else {
    selectedVenueIds.value.splice(index, 1)
  }
}

// Watch for custom range selection
watch(customDateRange, (newRange) => {
  if (isRestoring()) return
  if (newRange?.start && newRange?.end) {
    datePreset.value = 'custom'
    showCustomCalendar.value = false
  }
}, { deep: true })

// Which section was open is browser-only state, so restore it after hydration
onMounted(() => {
  try {
    expandedSection.value = localStorage.getItem(SECTION_STORAGE_KEY)
  } catch {
    // Storage can be unavailable
  }
})
</script>

<template>
  <div class="sidebar-filters">
    <!-- Search - sticky at top -->
    <div class="search-section">
      <UInput
        v-model="searchQuery"
        placeholder="Search events, artists..."
        size="sm"
        class="w-full"
        icon="i-heroicons-magnifying-glass"
      />
    </div>

    <!-- Date Range -->
    <FilterSection
      title="Date"
      section-key="date"
      :is-expanded="isSectionExpanded('date')"
      :badge="dateSummary !== 'All Upcoming' ? dateSummary : undefined"
      @toggle="toggleSection"
    >
      <DateRangeFilter
        :model-value="datePreset"
        :custom-range="customDateRange"
        @update:model-value="val => { datePreset = val }"
        @update:custom-range="val => { customDateRange = val }"
      />
    </FilterSection>

    <!-- Location (City → Venues hierarchical view) -->
    <FilterSection
      v-if="venuesByCity.length"
      title="Location"
      section-key="location"
      :is-expanded="isSectionExpanded('location')"
      :badge="venueSummary || undefined"
      @toggle="toggleSection"
    >
      <LocationFilter
        :venues-by-region="venuesByRegion"
        :venues-by-city="venuesByCity"
        :all-venues="props.venues"
        :selected-regions="selectedRegions"
        :selected-cities="selectedCities"
        :selected-venue-ids="selectedVenueIds"
        :selected-venue-objects="selectedVenueObjects"
        :expanded-regions="expandedRegions"
        :expanded-cities="expandedCities"
        :is-region-fully-selected="isRegionFullySelected"
        :is-region-partially-selected="isRegionPartiallySelected"
        :is-city-fully-selected="isCityFullySelected"
        :is-city-partially-selected="isCityPartiallySelected"
        :facets="facets"
        :show-venues="true"
        :show-search="true"
        @toggle-region="toggleRegion"
        @toggle-region-selection="toggleRegionSelection"
        @toggle-city="toggleCity"
        @toggle-city-selection="toggleCitySelection"
        @toggle-venue="toggleVenue"
        @select-venue="selectVenueFromSearch"
        @remove-venue="removeVenue"
      />
    </FilterSection>

    <!-- Map Filter - opens in modal -->
    <div
      v-if="venuesWithCoords.length"
      class="map-section"
    >
      <button
        class="map-trigger-btn"
        aria-label="Filter by map"
        @click="showMapModal = true"
      >
        <UIcon
          name="i-heroicons-map"
          class="w-4 h-4"
          aria-hidden="true"
        />
        <span>Filter by Map</span>
        <span
          v-if="mapFilteredVenueIds !== null"
          class="count-badge"
        >{{ mapFilteredVenueIds.length }}</span>
      </button>
      <div
        v-if="mapFilteredVenueIds !== null"
        class="map-active-indicator"
      >
        <span class="text-xs text-gray-600">
          {{ mapFilteredVenueIds.length }} venues in selected area
        </span>
        <button
          class="reset-map-btn"
          @click="resetMap"
        >
          Clear
        </button>
      </div>
    </div>

    <!-- Map Modal -->
    <Teleport to="#teleports">
      <div
        v-if="showMapModal"
        class="map-modal-overlay"
        @click.self="showMapModal = false"
      >
        <div class="map-modal">
          <div class="map-modal-header">
            <h3 class="text-lg font-semibold">
              Filter by Map
            </h3>
            <button
              class="map-modal-close"
              aria-label="Close map"
              @click="showMapModal = false"
            >
              <UIcon
                name="i-heroicons-x-mark"
                class="w-5 h-5"
                aria-hidden="true"
              />
            </button>
          </div>
          <div class="map-modal-body">
            <ClientOnly>
              <VenueMap
                :venues="venuesWithCoords"
                :persist-key="MAP_BOUNDS_KEY"
                :show-controls="true"
                class="h-full"
                @visible-venues="onMapVisibleVenues"
                @center-changed="onMapCenterChanged"
              />
            </ClientOnly>
          </div>
          <div class="map-modal-footer">
            <div class="map-footer-info">
              <span class="text-sm font-medium text-gray-900">
                {{ mapFilteredVenueIds?.length || venuesWithCoords.length }} venues
              </span>
              <span class="text-xs text-gray-500">
                Filters update as you pan/zoom
              </span>
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="mapFilteredVenueIds !== null"
                variant="ghost"
                size="sm"
                @click="resetMap"
              >
                Show All
              </UButton>
              <UButton
                color="primary"
                size="sm"
                @click="showMapModal = false;"
              >
                Done
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Event Type -->
    <FilterSection
      v-if="showEventTypeSection"
      title="Event Type"
      section-key="type"
      :is-expanded="isSectionExpanded('type')"
      :badge="typeSummary !== 'All Events' ? typeSummary : undefined"
      @toggle="toggleSection"
    >
      <EventTypeFilter
        :model-value="selectedEventTypes"
        :facets="facets"
        @update:model-value="val => { selectedEventTypes = val }"
      />
    </FilterSection>

    <!-- Genre - only show when music type is selected and genres available -->
    <FilterSection
      v-if="availableGenres.length && hasMusicTypeSelected"
      title="Genre"
      section-key="genre"
      :is-expanded="isSectionExpanded('genre')"
      :badge="genreSummary || undefined"
      @toggle="toggleSection"
    >
      <GenreFilter
        :model-value="selectedGenres"
        :genres="genres"
        :genre-labels="genreLabels"
        :facets="facets"
        @update:model-value="val => { selectedGenres = val }"
      />
    </FilterSection>

    <!-- For You - recommended and favorites matching -->
    <FilterSection
      v-if="loggedIn"
      title="For You"
      section-key="forYou"
      :is-expanded="isSectionExpanded('forYou')"
      :badge="forYouSummary || undefined"
      @toggle="toggleSection"
    >
      <ForYouFilter
        :recommended="recommended"
        :filter-by-artists="filterByFavoriteArtists"
        :filter-by-venues="filterByFavoriteVenues"
        :filter-by-genres="filterByFavoriteGenres"
        :artist-count="favorites.artists.length"
        :venue-count="favorites.venues.length"
        :genre-count="favorites.genres.length"
        @update:recommended="val => { recommended = val }"
        @update:filter-by-artists="val => { filterByFavoriteArtists = val }"
        @update:filter-by-venues="val => { filterByFavoriteVenues = val }"
        @update:filter-by-genres="val => { filterByFavoriteGenres = val }"
      />
      <NuxtLink
        to="/interests"
        class="manage-favorites-link"
      >
        <UIcon
          name="i-heroicons-cog-6-tooth"
          class="w-3.5 h-3.5"
        />
        Manage Interests
      </NuxtLink>
    </FilterSection>

    <!-- Saved Events - events user marked as interested/going -->
    <FilterSection
      v-if="loggedIn"
      title="Saved Events"
      section-key="myEvents"
      :is-expanded="isSectionExpanded('myEvents')"
      :badge="myEvents ? (myEvents === 'all' ? 'All Saved' : myEvents === 'interested' ? 'Interested' : 'Going') : undefined"
      @toggle="toggleSection"
    >
      <MyEventsFilter
        :model-value="myEvents"
        @update:model-value="val => { myEvents = val }"
      />
    </FilterSection>

    <!-- Reset Button -->
    <div
      v-if="hasActiveFilters"
      class="reset-section"
    >
      <button
        class="reset-all-btn"
        @click="resetFilters"
      >
        <UIcon
          name="i-heroicons-x-mark"
          class="w-4 h-4"
          aria-hidden="true"
        />
        Reset All Filters
        <span class="count-badge">{{ activeFilterCount }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar-filters {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.search-section {
  position: sticky;
  top: 0;
  background: white;
  padding-bottom: 0.5rem;
  margin: -1rem -1rem 0.5rem -1rem;
  padding: 1rem 1rem 0.75rem 1rem;
  border-bottom: 1px solid #e5e7eb;
  z-index: 10;
}

.filter-section {
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.5rem;
}

.filter-section:last-child {
  border-bottom: none;
}

.map-section {
  padding: 0.5rem 0;
}

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.section-header:hover {
  color: #2563eb;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.section-header:hover .section-title {
  color: #2563eb;
}

.section-meta {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  flex: 1;
  justify-content: flex-end;
}

.section-summary {
  font-size: 0.75rem;
  font-weight: 500;
  color: #2563eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.section-summary.muted {
  color: #9ca3af;
  font-weight: 400;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  background-color: #2563eb;
  border-radius: 9999px;
}

.section-content {
  padding: 0.25rem 0 0.5rem;
}

.radio-option,
.checkbox-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.8125rem;
  color: #374151;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
}

.radio-option:hover,
.checkbox-option:hover {
  background-color: #f3f4f6;
}

.radio-option.active,
.checkbox-option.active {
  background-color: #eff6ff;
  color: #1d4ed8;
}

.radio-dot {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  border: 2px solid #d1d5db;
  flex-shrink: 0;
}

.radio-dot.checked {
  border-color: #2563eb;
  background-color: #2563eb;
  box-shadow: inset 0 0 0 2px white;
}

.checkbox {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 0.1875rem;
  border: 2px solid #d1d5db;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox.small {
  width: 0.75rem;
  height: 0.75rem;
}

.checkbox.checked {
  border-color: #2563eb;
  background-color: #2563eb;
}

.checkbox.checked::after {
  content: '';
  width: 0.375rem;
  height: 0.25rem;
  border-left: 1.5px solid white;
  border-bottom: 1.5px solid white;
  transform: rotate(-45deg);
  margin-top: -1px;
}

.checkbox.small.checked::after {
  width: 0.3rem;
  height: 0.2rem;
}

.checkbox-option.small {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}

.sub-options {
  padding-left: 1rem;
  margin-left: 0.375rem;
  border-left: 2px solid #e5e7eb;
}

.calendar-wrapper {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #f9fafb;
  border-radius: 0.375rem;
}

.option-label {
  flex: 1;
  text-align: left;
}

.option-count {
  font-size: 0.6875rem;
  color: #9ca3af;
  margin-left: auto;
}

/* Manage favorites link */
.manage-favorites-link {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
  text-decoration: none;
  border-top: 1px solid #e5e7eb;
  transition: color 0.15s;
}

.manage-favorites-link:hover {
  color: #2563eb;
}

.checkbox-option.active .option-count {
  color: #60a5fa;
}

.show-more-btn {
  width: 100%;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #2563eb;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.show-more-btn:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.map-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #e5e7eb;
}

.reset-map-btn {
  font-size: 0.75rem;
  color: #6b7280;
  background: none;
  border: none;
  cursor: pointer;
}

.reset-map-btn:hover {
  color: #2563eb;
  text-decoration: underline;
}

.reset-section {
  padding-top: 0.75rem;
  margin-top: 0.25rem;
  border-top: 1px solid #e5e7eb;
}

.reset-all-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #6b7280;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.reset-all-btn:hover {
  background: #e5e7eb;
  color: #374151;
}

.reset-all-btn .count-badge {
  background-color: #6b7280;
}

/* Map trigger button */
.map-trigger-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.map-trigger-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.map-active-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: #eff6ff;
  border-radius: 0.25rem;
}

/* Map Modal */
.map-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}

.map-modal {
  background: white;
  border-radius: 0.75rem;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.map-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
}

.map-modal-close {
  padding: 0.25rem;
  color: #6b7280;
  border-radius: 0.375rem;
  transition: all 0.15s;
}

.map-modal-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.map-modal-body {
  flex: 1;
  min-height: 400px;
  height: 50vh;
  max-height: 60vh;
}

.map-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 0 0 0.75rem 0.75rem;
}

.map-footer-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

/* Filter list transitions - use :deep for Vue transitions */
:deep(.filter-list-enter-active),
:deep(.filter-list-leave-active) {
  transition: all 0.2s ease;
}

:deep(.filter-list-enter-from) {
  opacity: 0;
  transform: translateX(-10px);
}

:deep(.filter-list-leave-to) {
  opacity: 0;
  transform: translateX(10px);
}

:deep(.filter-list-move) {
  transition: transform 0.2s ease;
}

/* Smooth count updates */
.option-count {
  transition: all 0.2s ease;
}

/* Checkbox animation */
.checkbox {
  transition: all 0.15s ease;
}

.checkbox.checked {
  transform: scale(1.05);
}

/* Section expand/collapse */
.section-content {
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Active state pulse */
.checkbox-option.active,
.radio-option.active {
  transition: background-color 0.15s ease;
}

/* Map modal animation */
.map-modal-overlay {
  animation: fadeIn 0.2s ease;
}

.map-modal {
  animation: scaleIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Venue search/autocomplete */
.venue-search-wrapper {
  position: relative;
  margin-bottom: 0.5rem;
}

.venue-search-input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.venue-search-icon {
  position: absolute;
  left: 0.5rem;
  width: 1rem;
  height: 1rem;
  color: #9ca3af;
  pointer-events: none;
}

.venue-search-input {
  width: 100%;
  padding: 0.375rem 0.5rem 0.375rem 1.75rem;
  font-size: 0.8125rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  background: white;
  outline: none;
  transition: all 0.15s;
}

.venue-search-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.venue-search-input::placeholder {
  color: #9ca3af;
}

.venue-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  z-index: 20;
  max-height: 200px;
  overflow-y: auto;
}

.venue-dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.venue-dropdown-item:hover {
  background: #f3f4f6;
}

.venue-dropdown-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.venue-dropdown-empty {
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  color: #9ca3af;
  text-align: center;
}

/* Venue chips */
.venue-chips {
  margin-bottom: 0.5rem;
}

.venue-chips-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.venue-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.375rem 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 9999px;
  border: 1px solid #bfdbfe;
}

.venue-chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.125rem;
  color: #60a5fa;
  background: none;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.15s;
}

.venue-chip-remove:hover {
  color: #1d4ed8;
  background: #dbeafe;
}

/* Browse all venues button */
.browse-venues-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.browse-venues-btn:hover {
  color: #2563eb;
  border-color: #2563eb;
  background: #f8fafc;
}

.venue-browse-list {
  margin-top: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  padding: 0.25rem;
}

/* Region grouping */
.region-group {
  margin-bottom: 0.75rem;
}

.region-group:last-child {
  margin-bottom: 0;
}

.region-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.25rem;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s;
}

.region-header:hover {
  color: #374151;
}

/* Hierarchical Location (Region → City → Venues) */
.location-hierarchy {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Region grouping */
.region-group {
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  overflow: hidden;
  background: #ffffff;
}

.region-header-row {
  display: flex;
  align-items: stretch;
  background: #f3f4f6;
  border-bottom: 1px solid #d1d5db;
  transition: background 0.15s;
}

.region-header-row:hover {
  background: #e5e7eb;
}

.region-header {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.625rem;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.region-name {
  flex: 1;
  text-transform: capitalize;
}

.region-checkbox-btn {
  display: flex;
  align-items: center;
  padding: 0 0.625rem;
  background: none;
  border: none;
  cursor: pointer;
}

.region-checkbox-btn .checkbox.partial {
  background: #93c5fd;
  border-color: #3b82f6;
}

.region-checkbox-btn .checkbox.partial::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 2px;
  background: #1e40af;
}

.region-cities {
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* City grouping (nested within regions or standalone) */
.city-group {
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  overflow: hidden;
}

.city-header-row {
  display: flex;
  align-items: stretch;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  transition: background 0.15s;
}

.city-header-row:hover {
  background: #f3f4f6;
}

.city-header {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.city-name {
  flex: 1;
}

.city-checkbox-btn {
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
}

.city-checkbox-btn .checkbox.partial {
  background: #93c5fd;
  border-color: #3b82f6;
}

.city-checkbox-btn .checkbox.partial::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 2px;
  background: #1e40af;
}

.venue-list {
  display: flex;
  flex-direction: column;
}

.venue-option {
  padding-left: 2rem;
  border-top: 1px solid #f3f4f6;
}
</style>
