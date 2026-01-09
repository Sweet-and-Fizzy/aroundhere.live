<script setup lang="ts">
import type { RegionGroup, CityVenues, Venue } from '~/composables/useLocationFilter'

const props = defineProps<{
  // Data
  venuesByRegion: RegionGroup[]
  venuesByCity: CityVenues[]
  allVenues?: Venue[]
  // Selection state
  selectedRegions: string[]
  selectedCities: string[]
  selectedVenueIds: string[]
  selectedVenueObjects?: Venue[]
  // Expansion state
  expandedRegions: Set<string>
  expandedCities: Set<string>
  // Check functions
  isRegionFullySelected: (region: string) => boolean
  isRegionPartiallySelected: (region: string) => boolean
  isCityFullySelected: (city: string) => boolean
  isCityPartiallySelected: (city: string) => boolean
  // Facets for venue counts
  facets?: {
    venueCounts?: Record<string, number>
  }
  // Whether to show venue-level selection (for events) or just cities (for venues)
  showVenues?: boolean
  // Whether to show the search input
  showSearch?: boolean
}>()

const emit = defineEmits<{
  'toggle-region': [region: string]
  'toggle-region-selection': [region: string]
  'toggle-city': [city: string]
  'toggle-city-selection': [city: string]
  'toggle-venue': [venueId: string]
  'select-venue': [venueId: string]
  'remove-venue': [venueId: string]
}>()

// Venue search state
const venueSearchQuery = ref('')
const showVenueDropdown = ref(false)
const venueSearchInput = ref<HTMLInputElement | null>(null)

// Search results
const venueSearchResults = computed(() => {
  if (!venueSearchQuery.value.trim() || !props.allVenues) return []

  const query = venueSearchQuery.value.toLowerCase()
  return props.allVenues
    .filter(v => v.name.toLowerCase().includes(query))
    .slice(0, 10)
})

function onVenueSearchFocus() {
  showVenueDropdown.value = true
}

function onVenueSearchBlur() {
  // Delay to allow click events on dropdown items
  setTimeout(() => {
    showVenueDropdown.value = false
  }, 200)
}

function selectVenueFromSearch(venueId: string) {
  emit('select-venue', venueId)
  venueSearchQuery.value = ''
  showVenueDropdown.value = false
}

function removeVenue(venueId: string) {
  emit('remove-venue', venueId)
}

function getVenueCount(venueId: string): number {
  return props.facets?.venueCounts?.[venueId] || 0
}

function toggleRegionExpand(region: string) {
  emit('toggle-region', region)
}

function toggleRegionCheck(region: string) {
  emit('toggle-region-selection', region)
}

function toggleCityExpand(city: string) {
  emit('toggle-city', city)
}

function toggleCityCheck(city: string) {
  emit('toggle-city-selection', city)
}

function toggleVenueCheck(venueId: string) {
  emit('toggle-venue', venueId)
}

function isVenueSelected(venueId: string): boolean {
  return props.selectedVenueIds.includes(venueId)
}
</script>

<template>
  <div class="location-filter">
    <!-- Venue search autocomplete -->
    <div
      v-if="showSearch && allVenues?.length"
      class="venue-search-wrapper"
    >
      <div class="venue-search-input-container">
        <UIcon
          name="i-heroicons-magnifying-glass"
          class="venue-search-icon"
        />
        <input
          ref="venueSearchInput"
          v-model="venueSearchQuery"
          type="text"
          placeholder="Search venues..."
          class="venue-search-input"
          @focus="onVenueSearchFocus"
          @blur="onVenueSearchBlur"
        >
      </div>
      <!-- Autocomplete dropdown -->
      <div
        v-if="showVenueDropdown && venueSearchResults.length > 0"
        class="venue-dropdown"
      >
        <button
          v-for="venue in venueSearchResults"
          :key="venue.id"
          type="button"
          class="venue-dropdown-item"
          @mousedown.prevent="selectVenueFromSearch(venue.id)"
        >
          <span class="venue-dropdown-name">{{ venue.name }}</span>
          <span
            v-if="getVenueCount(venue.id)"
            class="option-count"
          >
            {{ getVenueCount(venue.id) }}
          </span>
        </button>
      </div>
      <div
        v-else-if="showVenueDropdown && venueSearchQuery.trim() && venueSearchResults.length === 0"
        class="venue-dropdown"
      >
        <div class="venue-dropdown-empty">
          No venues found
        </div>
      </div>
    </div>

    <!-- Selected venue chips -->
    <div
      v-if="selectedVenueObjects && selectedVenueObjects.length > 0"
      class="venue-chips"
    >
      <TransitionGroup
        name="filter-list"
        tag="div"
        class="venue-chips-list"
      >
        <span
          v-for="venue in selectedVenueObjects"
          :key="venue.id"
          class="venue-chip"
        >
          {{ venue.name }}
          <button
            type="button"
            class="venue-chip-remove"
            @click="removeVenue(venue.id)"
          >
            <UIcon
              name="i-heroicons-x-mark"
              class="w-3 h-3"
            />
          </button>
        </span>
      </TransitionGroup>
    </div>

    <!-- Location hierarchy -->
    <div class="location-hierarchy">
      <!-- Multiple regions: show region grouping -->
      <template v-if="venuesByRegion.length > 1">
        <div
          v-for="{ region, regionName, cities, totalEvents } in venuesByRegion"
          :key="region"
          class="region-group"
        >
          <!-- Region header -->
          <div class="region-header-row">
            <button
              type="button"
              class="region-header"
              @click="toggleRegionExpand(region)"
            >
              <UIcon
                :name="expandedRegions.has(region) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                class="w-4 h-4 text-gray-600"
              />
              <span class="region-name">{{ (regionName || region).replace(/^the /i, '') }}</span>
              <span class="option-count">{{ totalEvents }}</span>
            </button>
            <button
              type="button"
              class="region-checkbox-btn"
              :class="{
                'active': isRegionFullySelected(region),
                'partial': isRegionPartiallySelected(region)
              }"
              @click.stop="toggleRegionCheck(region)"
            >
              <span
                class="checkbox"
                :class="{
                  'checked': isRegionFullySelected(region),
                  'partial': isRegionPartiallySelected(region)
                }"
              />
            </button>
          </div>

          <!-- Cities under this region -->
          <div
            v-if="expandedRegions.has(region)"
            class="region-cities"
          >
            <div
              v-for="{ city, venues: cityVenues, totalEvents: cityTotal } in cities"
              :key="city"
              class="city-group"
            >
              <!-- City header -->
              <div class="city-header-row">
                <button
                  type="button"
                  class="city-header"
                  @click="showVenues ? toggleCityExpand(city) : toggleCityCheck(city)"
                >
                  <UIcon
                    v-if="showVenues"
                    :name="expandedCities.has(city) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                    class="w-3.5 h-3.5 text-gray-500"
                  />
                  <span class="city-name">{{ city }}</span>
                  <span class="option-count">{{ cityTotal }}</span>
                </button>
                <button
                  type="button"
                  class="city-checkbox-btn"
                  :class="{
                    'active': isCityFullySelected(city),
                    'partial': isCityPartiallySelected(city)
                  }"
                  @click.stop="toggleCityCheck(city)"
                >
                  <span
                    class="checkbox"
                    :class="{
                      'checked': isCityFullySelected(city),
                      'partial': isCityPartiallySelected(city)
                    }"
                  />
                </button>
              </div>

              <!-- Venues under this city -->
              <TransitionGroup
                v-if="showVenues && expandedCities.has(city)"
                name="filter-list"
                tag="div"
                class="venue-list"
              >
                <button
                  v-for="venue in cityVenues"
                  :key="venue.id"
                  type="button"
                  class="checkbox-option venue-option"
                  :class="{ active: isVenueSelected(venue.id) }"
                  @click="toggleVenueCheck(venue.id)"
                >
                  <span
                    class="checkbox"
                    :class="{ checked: isVenueSelected(venue.id) }"
                  />
                  <span class="option-label">{{ venue.name }}</span>
                  <span
                    v-if="getVenueCount(venue.id)"
                    class="option-count"
                  >
                    {{ getVenueCount(venue.id) }}
                  </span>
                </button>
              </TransitionGroup>
            </div>
          </div>
        </div>
      </template>

      <!-- Single region: show cities directly without region grouping -->
      <template v-else>
        <div
          v-for="{ city, venues: cityVenues, totalEvents } in venuesByCity"
          :key="city"
          class="city-group"
        >
          <!-- City header -->
          <div class="city-header-row">
            <button
              type="button"
              class="city-header"
              @click="showVenues ? toggleCityExpand(city) : toggleCityCheck(city)"
            >
              <UIcon
                v-if="showVenues"
                :name="expandedCities.has(city) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                class="w-3.5 h-3.5 text-gray-500"
              />
              <span class="city-name">{{ city }}</span>
              <span class="option-count">{{ totalEvents }}</span>
            </button>
            <button
              type="button"
              class="city-checkbox-btn"
              :class="{
                'active': isCityFullySelected(city),
                'partial': isCityPartiallySelected(city)
              }"
              @click.stop="toggleCityCheck(city)"
            >
              <span
                class="checkbox"
                :class="{
                  'checked': isCityFullySelected(city),
                  'partial': isCityPartiallySelected(city)
                }"
              />
            </button>
          </div>

          <!-- Venues under this city -->
          <TransitionGroup
            v-if="showVenues && expandedCities.has(city)"
            name="filter-list"
            tag="div"
            class="venue-list"
          >
            <button
              v-for="venue in cityVenues"
              :key="venue.id"
              type="button"
              class="checkbox-option venue-option"
              :class="{ active: isVenueSelected(venue.id) }"
              @click="toggleVenueCheck(venue.id)"
            >
              <span
                class="checkbox"
                :class="{ checked: isVenueSelected(venue.id) }"
              />
              <span class="option-label">{{ venue.name }}</span>
              <span
                v-if="getVenueCount(venue.id)"
                class="option-count"
              >
                {{ getVenueCount(venue.id) }}
              </span>
            </button>
          </TransitionGroup>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.location-filter {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.location-hierarchy {
  max-height: 300px;
  overflow-y: auto;
}

/* Venue Search */
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
  left: 0.625rem;
  width: 0.875rem;
  height: 0.875rem;
  color: #9ca3af;
  pointer-events: none;
}

.venue-search-input {
  width: 100%;
  padding: 0.5rem 0.75rem 0.5rem 2rem;
  font-size: 0.8125rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.venue-search-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.venue-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  z-index: 50;
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
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s;
}

.venue-dropdown-item:hover {
  background-color: #f3f4f6;
}

.venue-dropdown-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.venue-dropdown-empty {
  padding: 0.75rem;
  text-align: center;
  font-size: 0.8125rem;
  color: #6b7280;
}

/* Venue Chips */
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
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #1d4ed8;
  background-color: #eff6ff;
  border-radius: 9999px;
}

.venue-chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.125rem;
  margin-left: 0.125rem;
  border-radius: 9999px;
  background: none;
  border: none;
  cursor: pointer;
  color: #60a5fa;
  transition: color 0.15s, background-color 0.15s;
}

.venue-chip-remove:hover {
  color: #1d4ed8;
  background-color: #dbeafe;
}

/* Region styles */
.region-group {
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.25rem;
}

.region-group:last-child {
  border-bottom: none;
}

.region-header-row {
  display: flex;
  align-items: center;
  border-radius: 0.25rem;
  transition: background 0.15s;
}

.region-header-row:hover {
  background: #f3f4f6;
}

.region-header {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  text-align: left;
  justify-content: flex-start;
  background: none;
  border: none;
  cursor: pointer;
}

.region-name {
  flex: 1;
  text-transform: capitalize;
}

.region-checkbox-btn,
.city-checkbox-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
}

.region-cities {
  padding-left: 0.75rem;
  padding-top: 0.25rem;
}

/* City styles */
.city-group {
  margin-bottom: 0.125rem;
}

.city-header-row {
  display: flex;
  align-items: center;
  transition: background 0.15s;
  border-radius: 0.25rem;
}

.city-header-row:hover {
  background: #f3f4f6;
}

.city-header {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
}

.city-name {
  flex: 1;
}

/* Venue list */
.venue-list {
  padding-left: 1.25rem;
  padding-top: 0.25rem;
}

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

.checkbox-option:hover {
  background-color: #f3f4f6;
}

.checkbox-option.active {
  background-color: #eff6ff;
  color: #1d4ed8;
}

.venue-option {
  font-size: 0.75rem;
}

/* Checkbox styles */
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

.checkbox.partial {
  background-color: #2563eb;
  border-color: #2563eb;
}

.checkbox.partial::after {
  content: '';
  width: 0.5rem;
  height: 2px;
  background: white;
  border-radius: 1px;
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

.checkbox-option.active .option-count {
  color: #60a5fa;
}

/* Transitions */
.filter-list-enter-active,
.filter-list-leave-active {
  transition: all 0.2s ease;
}

.filter-list-enter-from,
.filter-list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
</style>
