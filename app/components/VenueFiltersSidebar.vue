<script setup lang="ts">
const props = defineProps<{
  venues?: Array<{
    id: string
    name: string
    city?: string | null
    region?: { id: string; name: string } | null
    venueType: string
    verified: boolean
    _count?: { events: number }
  }>
}>()

const emit = defineEmits<{
  filter: [filters: { venueTypes?: string[]; cities?: string[]; hasEvents?: boolean; verified?: boolean; searchQuery?: string }]
}>()

// LocalStorage key
const STORAGE_KEY = 'venueFilters'

// Load saved filters
function loadSavedFilters() {
  if (import.meta.client) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {
      // Ignore
    }
  }
  return null
}

const savedFilters = loadSavedFilters()

// Filter state
const searchQuery = ref(savedFilters?.searchQuery || '')
const selectedVenueTypes = ref<string[]>(savedFilters?.selectedVenueTypes || [])
const selectedCities = ref<string[]>(savedFilters?.selectedCities || [])
const hasEventsOnly = ref<boolean>(savedFilters?.hasEventsOnly || false)
const verifiedOnly = ref<boolean>(savedFilters?.verifiedOnly || false)
const expandedSection = ref<string | null>(savedFilters?.expandedSection || null)

// Venue types with labels
const venueTypes = [
  { value: 'BAR', label: 'Bar' },
  { value: 'BREWERY', label: 'Brewery' },
  { value: 'CLUB', label: 'Club' },
  { value: 'THEATER', label: 'Theater' },
  { value: 'CONCERT_HALL', label: 'Concert Hall' },
  { value: 'OUTDOOR', label: 'Outdoor' },
  { value: 'CAFE', label: 'Café' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'HOUSE_SHOW', label: 'House Show' },
  { value: 'OTHER', label: 'Other' },
]

// Get current region name for auto-expanding
const { regionName: currentRegionName } = useCurrentRegion()

// Track expanded regions
const expandedRegions = ref<Set<string>>(new Set())

// Group venues by region -> city
const venuesByRegion = computed(() => {
  const grouped = new Map<string, Map<string, typeof props.venues>>()

  props.venues?.forEach(venue => {
    const regionName = venue.region?.name || 'Other'
    const cityName = venue.city || 'Unknown'

    if (!grouped.has(regionName)) {
      grouped.set(regionName, new Map())
    }

    const regionMap = grouped.get(regionName)!
    if (!regionMap.has(cityName)) {
      regionMap.set(cityName, [])
    }

    regionMap.get(cityName)!.push(venue)
  })

  // Convert to array
  const regions = Array.from(grouped.entries())
    .map(([region, citiesMap]) => ({
      region,
      cities: Array.from(citiesMap.entries())
        .map(([city, venuesInCity]) => ({
          city,
          venues: venuesInCity,
          totalVenues: venuesInCity.length
        }))
        .sort((a, b) => a.city.localeCompare(b.city)),
      totalVenues: Array.from(citiesMap.values()).reduce((sum, venuesInCity) => sum + venuesInCity.length, 0)
    }))

  // Sort: current region first, then alphabetically
  const currentRegion = currentRegionName.value?.toLowerCase() || ''
  return regions.sort((a, b) => {
    const aIsCurrentRegion = currentRegion && currentRegion !== 'the area' && (
      a.region.toLowerCase().includes(currentRegion) ||
      currentRegion.includes(a.region.toLowerCase())
    )
    const bIsCurrentRegion = currentRegion && currentRegion !== 'the area' && (
      b.region.toLowerCase().includes(currentRegion) ||
      currentRegion.includes(b.region.toLowerCase())
    )

    // Current region always first
    if (aIsCurrentRegion && !bIsCurrentRegion) return -1
    if (!aIsCurrentRegion && bIsCurrentRegion) return 1

    // Then alphabetically
    return a.region.localeCompare(b.region)
  })
})

// Get cities grouped by region -> city (flattened for single-region view)
const venuesByCity = computed(() => {
  const cityMap = new Map<string, typeof props.venues>()

  props.venues?.forEach(venue => {
    const cityName = venue.city || 'Unknown'
    if (!cityMap.has(cityName)) {
      cityMap.set(cityName, [])
    }
    cityMap.get(cityName)!.push(venue)
  })

  return Array.from(cityMap.entries())
    .map(([city, venuesInCity]) => ({
      city,
      venues: venuesInCity,
      totalVenues: venuesInCity.length
    }))
    .sort((a, b) => a.city.localeCompare(b.city))
})

// Get unique cities from venues (for backward compatibility)
const availableCities = computed(() => {
  const cities = new Set<string>()
  props.venues?.forEach(v => {
    if (v.city) cities.add(v.city)
  })
  return Array.from(cities).sort()
})

// Get venue type counts
const venueTypeCounts = computed(() => {
  const counts: Record<string, number> = {}
  props.venues?.forEach(v => {
    counts[v.venueType] = (counts[v.venueType] || 0) + 1
  })
  return counts
})


// Filter available venue types to only show those that exist
const availableVenueTypes = computed(() => {
  return venueTypes.filter(t => (venueTypeCounts.value[t.value] || 0) > 0)
})

// Active filters count
const activeFilterCount = computed(() => {
  let count = 0
  if (searchQuery.value) count++
  if (selectedVenueTypes.value.length > 0) count++
  if (selectedCities.value.length > 0) count++
  if (hasEventsOnly.value) count++
  if (verifiedOnly.value) count++
  return count
})

// Section toggle
function toggleSection(section: string) {
  if (expandedSection.value === section) {
    expandedSection.value = null
  } else {
    expandedSection.value = section
  }
  saveFilters()
}

function isSectionExpanded(section: string) {
  return expandedSection.value === section
}

// Save filters
function saveFilters() {
  if (import.meta.client) {
    const filters = {
      searchQuery: searchQuery.value,
      selectedVenueTypes: selectedVenueTypes.value,
      selectedCities: selectedCities.value,
      hasEventsOnly: hasEventsOnly.value,
      verifiedOnly: verifiedOnly.value,
      expandedSection: expandedSection.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  }
}

// Apply filters
function applyFilters() {
  emit('filter', {
    venueTypes: selectedVenueTypes.value.length > 0 ? selectedVenueTypes.value : undefined,
    cities: selectedCities.value.length > 0 ? selectedCities.value : undefined,
    hasEvents: hasEventsOnly.value || undefined,
    verified: verifiedOnly.value || undefined,
    searchQuery: searchQuery.value || undefined,
  })
  saveFilters()
}

// Toggle functions
function toggleVenueType(type: string) {
  const index = selectedVenueTypes.value.indexOf(type)
  if (index === -1) {
    selectedVenueTypes.value.push(type)
  } else {
    selectedVenueTypes.value.splice(index, 1)
  }
  applyFilters()
}

function toggleCity(city: string) {
  const index = selectedCities.value.indexOf(city)
  if (index === -1) {
    selectedCities.value.push(city)
  } else {
    selectedCities.value.splice(index, 1)
  }
  applyFilters()
}

// Region and city expansion functions
function toggleRegion(region: string) {
  if (expandedRegions.value.has(region)) {
    expandedRegions.value.delete(region)
  } else {
    expandedRegions.value.add(region)
  }
}


// Check if region/city is fully/partially selected
function isRegionFullySelected(region: string): boolean {
  const regionData = venuesByRegion.value.find(r => r.region === region)
  if (!regionData) return false

  const allCities = regionData.cities.map(c => c.city)
  return allCities.every(city => selectedCities.value.includes(city))
}

function isRegionPartiallySelected(region: string): boolean {
  const regionData = venuesByRegion.value.find(r => r.region === region)
  if (!regionData) return false

  const allCities = regionData.cities.map(c => c.city)
  const someSelected = allCities.some(city => selectedCities.value.includes(city))
  const allSelected = allCities.every(city => selectedCities.value.includes(city))

  return someSelected && !allSelected
}

function toggleRegionSelection(region: string) {
  const regionData = venuesByRegion.value.find(r => r.region === region)
  if (!regionData) return

  const allCities = regionData.cities.map(c => c.city)

  if (isRegionFullySelected(region)) {
    // Deselect all cities in this region
    selectedCities.value = selectedCities.value.filter(city => !allCities.includes(city))
  } else {
    // Select all cities in this region
    allCities.forEach(city => {
      if (!selectedCities.value.includes(city)) {
        selectedCities.value.push(city)
      }
    })
  }

  applyFilters()
}

// Reset filters
function resetFilters() {
  searchQuery.value = ''
  selectedVenueTypes.value = []
  selectedCities.value = []
  hasEventsOnly.value = false
  verifiedOnly.value = false
  if (import.meta.client) {
    localStorage.removeItem(STORAGE_KEY)
  }
  applyFilters()
}

// Summaries
const typeSummary = computed(() => {
  if (selectedVenueTypes.value.length === 0) return null
  const labels = selectedVenueTypes.value.map(t => venueTypes.find(vt => vt.value === t)?.label).filter(Boolean)
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return labels.join(', ')
  return `${labels[0]} +${labels.length - 1} more`
})

const citySummary = computed(() => {
  if (selectedCities.value.length === 0) return null
  if (selectedCities.value.length === 1) return selectedCities.value[0]
  if (selectedCities.value.length === 2) return selectedCities.value.join(', ')
  return `${selectedCities.value[0]} +${selectedCities.value.length - 1} more`
})

// Debounce search
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(applyFilters, 300)
})

// Watch toggle changes
watch(hasEventsOnly, applyFilters)
watch(verifiedOnly, applyFilters)

// Auto-expand current region
watch([venuesByRegion, currentRegionName], ([regions, regionName]) => {
  if (regions.length > 1 && regionName && regionName !== 'the area') {
    const matchingRegion = regions.find(r =>
      r.region.toLowerCase().includes(regionName.toLowerCase()) ||
      regionName.toLowerCase().includes(r.region.toLowerCase())
    )
    if (matchingRegion && !expandedRegions.value.has(matchingRegion.region)) {
      expandedRegions.value.add(matchingRegion.region)
    }
  }
}, { immediate: true })

onMounted(() => {
  applyFilters()
})
</script>

<template>
  <div class="sidebar-filters">
    <!-- Search - sticky at top -->
    <div class="search-section">
      <UInput
        v-model="searchQuery"
        placeholder="Search venues..."
        size="sm"
        class="w-full"
        icon="i-heroicons-magnifying-glass"
      />
    </div>

    <!-- Venue Type -->
    <div
      v-if="availableVenueTypes.length"
      class="filter-section"
    >
      <button
        class="section-header"
        @click="toggleSection('type')"
      >
        <span class="section-title">
          <UIcon
            name="i-heroicons-building-storefront"
            class="w-4 h-4"
          />
          Venue Type
        </span>
        <span class="section-meta">
          <span
            v-if="!isSectionExpanded('type') && typeSummary"
            class="section-summary"
          >{{ typeSummary }}</span>
          <span
            v-else-if="!isSectionExpanded('type')"
            class="section-summary muted"
          >All types</span>
          <UIcon
            :name="isSectionExpanded('type') ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            class="w-4 h-4 text-gray-400"
          />
        </span>
      </button>
      <div
        v-if="isSectionExpanded('type')"
        class="section-content"
      >
        <button
          v-for="type in availableVenueTypes"
          :key="type.value"
          class="checkbox-option"
          :class="{ active: selectedVenueTypes.includes(type.value) }"
          @click="toggleVenueType(type.value)"
        >
          <span
            class="checkbox"
            :class="{ checked: selectedVenueTypes.includes(type.value) }"
          />
          <span class="option-label">{{ type.label }}</span>
          <span class="option-count">{{ venueTypeCounts[type.value] }}</span>
        </button>
      </div>
    </div>

    <!-- Location (Region/City) -->
    <div
      v-if="availableCities.length"
      class="filter-section"
    >
      <button
        class="section-header"
        @click="toggleSection('city')"
      >
        <span class="section-title">
          <UIcon
            name="i-heroicons-map-pin"
            class="w-4 h-4"
          />
          Location
        </span>
        <span class="section-meta">
          <span
            v-if="!isSectionExpanded('city') && citySummary"
            class="section-summary"
          >{{ citySummary }}</span>
          <span
            v-else-if="!isSectionExpanded('city')"
            class="section-summary muted"
          >All locations</span>
          <UIcon
            :name="isSectionExpanded('city') ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            class="w-4 h-4 text-gray-400"
          />
        </span>
      </button>
      <div
        v-if="isSectionExpanded('city')"
        class="section-content location-hierarchy"
      >
        <!-- Multiple regions: show region grouping -->
        <template v-if="venuesByRegion.length > 1">
          <div
            v-for="{ region, cities, totalVenues } in venuesByRegion"
            :key="region"
            class="region-group"
          >
            <!-- Region header -->
            <div class="region-header-row">
              <button
                class="region-header"
                @click="toggleRegion(region)"
              >
                <UIcon
                  :name="expandedRegions.has(region) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-3.5 h-3.5"
                />
                <span class="region-name">{{ region }}</span>
                <span class="option-count">{{ totalVenues }}</span>
              </button>
              <button
                class="region-checkbox-btn"
                :class="{
                  'active': isRegionFullySelected(region),
                  'partial': isRegionPartiallySelected(region)
                }"
                @click.stop="toggleRegionSelection(region)"
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
                v-for="{ city, totalVenues: cityTotal } in cities"
                :key="city"
                class="city-row"
              >
                <button
                  class="checkbox-option city-option"
                  :class="{ active: selectedCities.includes(city) }"
                  @click="toggleCity(city)"
                >
                  <span
                    class="checkbox"
                    :class="{ checked: selectedCities.includes(city) }"
                  />
                  <span class="option-label">{{ city }}</span>
                  <span class="option-count">{{ cityTotal }}</span>
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Single region: show cities directly without region grouping -->
        <template v-else>
          <div
            v-for="{ city, totalVenues } in venuesByCity"
            :key="city"
            class="city-row"
          >
            <button
              class="checkbox-option city-option"
              :class="{ active: selectedCities.includes(city) }"
              @click="toggleCity(city)"
            >
              <span
                class="checkbox"
                :class="{ checked: selectedCities.includes(city) }"
              />
              <span class="option-label">{{ city }}</span>
              <span class="option-count">{{ totalVenues }}</span>
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Reset Button -->
    <div
      v-if="activeFilterCount > 0"
      class="reset-section"
    >
      <button
        class="reset-all-btn"
        @click="resetFilters"
      >
        <UIcon
          name="i-heroicons-x-mark"
          class="w-4 h-4"
        />
        Reset Filters
        <span class="count-badge">{{ activeFilterCount }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Use same styles as EventFiltersSidebar */
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

.toggle-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.8125rem;
  color: #374151;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  margin-bottom: 0.25rem;
}

.toggle-option:hover {
  background-color: #f3f4f6;
}

.toggle-option.active {
  background-color: #eff6ff;
  color: #1d4ed8;
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

.section-content {
  padding: 0.25rem 0 0.5rem;
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

.option-label {
  flex: 1;
  text-align: left;
}

.option-count {
  font-size: 0.6875rem;
  color: #9ca3af;
  margin-left: auto;
}

.checkbox-option.active .option-count,
.toggle-option.active .option-count {
  color: #60a5fa;
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

.reset-section {
  padding-top: 0.75rem;
  margin-top: 0.5rem;
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

/* Region/City Hierarchy Styles */
.location-hierarchy {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.region-group {
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.25rem;
}

.region-group:last-child {
  border-bottom: none;
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

.region-checkbox-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
}

.region-checkbox-btn .checkbox.partial {
  background-color: #2563eb;
  border-color: #2563eb;
}

.region-checkbox-btn .checkbox.partial::after {
  content: '';
  width: 0.5rem;
  height: 2px;
  background: white;
  border-radius: 1px;
}

.region-cities {
  padding-left: 0.75rem;
  padding-top: 0.25rem;
}

.city-row {
  margin-bottom: 0.125rem;
}

.city-option {
  width: 100%;
}
</style>
