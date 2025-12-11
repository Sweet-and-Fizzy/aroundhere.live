<script setup lang="ts">
import type { Map as LeafletMap, Circle as LeafletCircle } from 'leaflet'

interface Venue {
  id: string
  name: string
  slug: string
  latitude?: number | null
  longitude?: number | null
  city?: string | null
  address?: string | null
}

interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

interface MapCenter {
  lat: number
  lng: number
  radius: number // miles
}

const props = defineProps<{
  venues: Venue[]
  persistKey?: string // localStorage key for persisting map bounds
  showControls?: boolean // Show search, locate, and radius controls
}>()

const emit = defineEmits<{
  visibleVenues: [venueIds: string[]]
  centerChanged: [center: MapCenter]
}>()

// Search and controls state
const searchQuery = ref('')
const searchResults = ref<Array<{ name: string; lat: number; lng: number }>>([])
const showSearchResults = ref(false)
const isSearching = ref(false)
const isLocating = ref(false)
const searchRadius = ref<number | 'view'>(25) // miles, or 'view' for map extent
const radiusCircle = ref<LeafletCircle | null>(null)
const currentCenter = ref<{ lat: number; lng: number } | null>(null)

// Radius options in miles ('view' = map extent)
const radiusOptions: (number | 'view')[] = ['view', 5, 10, 15, 25, 50, 100]

// Debounced location search using Nominatim
let searchTimeout: ReturnType<typeof setTimeout>
async function searchLocation(query: string) {
  if (!query || query.length < 2) {
    searchResults.value = []
    showSearchResults.value = false
    return
  }

  isSearching.value = true
  try {
    // Search Nominatim for places - bias toward US
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=5`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await response.json()
    searchResults.value = data.map((r: { display_name: string; lat: string; lon: string }) => ({
      name: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }))

    // Also search venues by name
    const matchingVenues = props.venues
      .filter(v => v.latitude && v.longitude && v.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3)
      .map(v => ({
        name: `📍 ${v.name}`,
        lat: v.latitude!,
        lng: v.longitude!,
      }))

    searchResults.value = [...matchingVenues, ...searchResults.value].slice(0, 6)
    showSearchResults.value = searchResults.value.length > 0
  } catch (error) {
    console.error('Location search failed:', error)
  } finally {
    isSearching.value = false
  }
}

watch(searchQuery, (query) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => searchLocation(query), 300)
})

function selectSearchResult(result: { name: string; lat: number; lng: number }) {
  if (!map.value) return
  showSearchResults.value = false
  searchResults.value = [] // Clear results to prevent re-showing
  searchQuery.value = result.name.replace(/📍 /, '').split(',')[0] // Clean up display
  centerMapAt(result.lat, result.lng)
}

function hideSearchResults() {
  // Small delay to allow click events on results to fire first
  setTimeout(() => {
    showSearchResults.value = false
  }, 150)
}

function centerMapAt(lat: number, lng: number) {
  if (!map.value) return
  currentCenter.value = { lat, lng }
  map.value.setView([lat, lng], 11)
  updateRadiusCircle()
  emitCenterChanged()
}

function updateRadiusCircle() {
  // Remove existing circle first
  if (radiusCircle.value) {
    radiusCircle.value.remove()
    radiusCircle.value = null
  }

  // Don't show circle for 'view' mode or if no center
  if (!map.value || !currentCenter.value || searchRadius.value === 'view') return

  // Import L dynamically since we're in a module
  import('leaflet').then((L) => {
    // Miles to meters conversion
    const radiusMeters = (searchRadius.value as number) * 1609.34

    radiusCircle.value = L.circle([currentCenter.value!.lat, currentCenter.value!.lng], {
      radius: radiusMeters,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      weight: 2,
    }).addTo(map.value as LeafletMap)
  })
}

function emitCenterChanged() {
  if (currentCenter.value) {
    emit('centerChanged', {
      lat: currentCenter.value.lat,
      lng: currentCenter.value.lng,
      radius: searchRadius.value, // number or 'view'
    })
  }
}

// Emit visible venues (for 'view' mode)
function emitCurrentVisibleVenues() {
  if (!map.value) return
  const bounds = map.value.getBounds()
  const visibleIds = mappableVenues.value
    .filter(v => v.latitude && v.longitude && bounds.contains([v.latitude, v.longitude]))
    .map(v => v.id)
  emit('visibleVenues', visibleIds)
}

// Update radius and recenter
function onRadiusChange(newRadius: number | 'view') {
  searchRadius.value = newRadius
  updateRadiusCircle()
  emitCenterChanged()
  // If switching to view mode, emit visible venues immediately
  if (newRadius === 'view') {
    emitCurrentVisibleVenues()
  }
}

// Geolocation - find user's location
async function locateMe() {
  if (!map.value) return
  isLocating.value = true

  // Clear search state to prevent dropdown from showing
  showSearchResults.value = false
  searchResults.value = []

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes cache
      })
    })

    const { latitude, longitude } = position.coords
    // Set query without triggering search by clearing timeout
    clearTimeout(searchTimeout)
    searchQuery.value = 'My Location'
    centerMapAt(latitude, longitude)
  } catch (error) {
    console.error('Geolocation failed:', error)
    // Fallback to IP geolocation
    try {
      const response = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) })
      if (response.ok) {
        const data = await response.json()
        if (data.latitude && data.longitude) {
          clearTimeout(searchTimeout)
          searchQuery.value = data.city || 'My Location'
          centerMapAt(data.latitude, data.longitude)
        }
      }
    } catch {
      alert('Could not determine your location. Please search for a location instead.')
    }
  } finally {
    isLocating.value = false
  }
}

// Load saved bounds from localStorage
const savedBounds = ref<MapBounds | null>(null)
if (import.meta.client && props.persistKey) {
  try {
    const saved = localStorage.getItem(props.persistKey)
    if (saved) {
      savedBounds.value = JSON.parse(saved)
    }
  } catch {
    // Ignore parse errors
  }
}

function saveBounds(bounds: MapBounds) {
  if (import.meta.client && props.persistKey) {
    localStorage.setItem(props.persistKey, JSON.stringify(bounds))
  }
}

const mapContainer = ref<HTMLElement | null>(null)
const map = ref<LeafletMap | null>(null)

// Filter venues with valid coordinates
const mappableVenues = computed(() =>
  props.venues.filter(v => v.latitude && v.longitude)
)

// Calculate center of all venues
const mapCenter = computed(() => {
  const venues = mappableVenues.value
  if (venues.length === 0) return [42.32, -72.63] // Default: Northampton area

  const avgLat = venues.reduce((sum, v) => sum + (v.latitude || 0), 0) / venues.length
  const avgLng = venues.reduce((sum, v) => sum + (v.longitude || 0), 0) / venues.length
  return [avgLat, avgLng]
})

onMounted(async () => {
  // Only run on client
  if (!import.meta.client) return

  const L = await import('leaflet')
  await import('leaflet/dist/leaflet.css')

  // Fix default marker icon issue with bundlers
  delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })

  if (!mapContainer.value) return

  // Initialize map - use saved bounds if available to avoid pan animation
  if (savedBounds.value) {
    const savedBoundsObj = L.latLngBounds(
      [savedBounds.value.south, savedBounds.value.west],
      [savedBounds.value.north, savedBounds.value.east]
    )
    map.value = L.map(mapContainer.value).fitBounds(savedBoundsObj)
  } else {
    map.value = L.map(mapContainer.value).setView(
      mapCenter.value as [number, number],
      mappableVenues.value.length > 1 ? 10 : 13
    )
  }

  // Add CARTO Voyager tiles (cleaner, modern look without terrain markers)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map.value as LeafletMap)

  // Add markers for each venue with tooltips
  for (const venue of mappableVenues.value) {
    if (venue.latitude && venue.longitude) {
      L.marker([venue.latitude, venue.longitude])
        .addTo(map.value as LeafletMap)
        .bindPopup(`
          <strong>${venue.name}</strong>
          ${venue.address ? `<br>${venue.address}` : ''}
          ${venue.city ? `<br>${venue.city}` : ''}
          <br><a href="/venues/${venue.slug}">View venue</a>
        `)
        .bindTooltip(venue.name, {
          permanent: true,
          direction: 'top',
          offset: [0, -10],
          className: 'venue-label',
        })
    }
  }

  // If no saved bounds, fit to venues or user location
  if (!savedBounds.value && mappableVenues.value.length > 1) {
    // Fit bounds to show all markers if multiple venues
    const bounds = L.latLngBounds(
      mappableVenues.value.map(v => [v.latitude!, v.longitude!] as [number, number])
    )
    map.value.fitBounds(bounds, { padding: [30, 30] })

    // Try to center on user's approximate location via IP geolocation (no permissions needed)
    const currentMap = map.value
    try {
      const response = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
      if (response.ok) {
        const data = await response.json()
        if (data.latitude && data.longitude) {
          const userLat = data.latitude
          const userLng = data.longitude

          // Find the closest venue to the user
          let closestVenue: typeof mappableVenues.value[0] | null = null
          let closestDistance = Infinity
          for (const v of mappableVenues.value) {
            if (!v.latitude || !v.longitude) continue
            const latDiff = v.latitude - userLat
            const lngDiff = v.longitude - userLng
            const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff)
            if (distance < closestDistance) {
              closestDistance = distance
              closestVenue = v
            }
          }

          // Only recenter if user is reasonably close to any venue (within ~100 miles / ~1.5 degrees)
          if (closestVenue && closestDistance < 1.5 && currentMap) {
            // Create bounds that include user location and closest venue
            const bounds = L.latLngBounds([
              [userLat, userLng],
              [closestVenue.latitude!, closestVenue.longitude!],
            ])
            currentMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 })
          }
        }
      }
    } catch {
      // IP geolocation failed - keep default view
    }
  }

  // Show/hide labels based on zoom level using CSS class
  const LABEL_MIN_ZOOM = 11
  const mapEl = mapContainer.value

  function updateLabelVisibility() {
    if (!mapEl || !map.value) return
    const showLabels = map.value.getZoom() >= LABEL_MIN_ZOOM
    mapEl.classList.toggle('show-labels', showLabels)
  }

  // Emit visible venues and bounds when map bounds change
  function emitVisibleVenues() {
    if (!map.value) return
    const bounds = map.value.getBounds()
    const visibleIds = mappableVenues.value
      .filter(v => v.latitude && v.longitude && bounds.contains([v.latitude, v.longitude]))
      .map(v => v.id)
    emit('visibleVenues', visibleIds)
  }

  function handleBoundsChange() {
    if (!map.value) return
    const bounds = map.value.getBounds()
    saveBounds({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    })
  }

  updateLabelVisibility()
  emitVisibleVenues()

  // Emit initial center state for 'view' mode
  if (searchRadius.value === 'view') {
    emit('centerChanged', {
      lat: map.value.getCenter().lat,
      lng: map.value.getCenter().lng,
      radius: 'view' as const,
    })
  }

  map.value.on('zoomend', () => {
    updateLabelVisibility()
    emitVisibleVenues()
    handleBoundsChange()
  })
  map.value.on('moveend', () => {
    emitVisibleVenues()
    handleBoundsChange()
  })
})

onUnmounted(() => {
  if (map.value) {
    map.value.remove()
  }
})
</script>

<template>
  <div
    v-if="mappableVenues.length > 0"
    class="venue-map-container"
  >
    <!-- Map Controls -->
    <div
      v-if="showControls"
      class="map-controls"
    >
      <!-- Search Input -->
      <div class="search-container">
        <div class="search-input-wrapper">
          <UIcon
            name="i-heroicons-magnifying-glass"
            class="search-icon"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search location or venue..."
            class="search-input"
            @focus="showSearchResults = searchResults.length > 0"
            @blur="hideSearchResults"
          >
          <UIcon
            v-if="isSearching"
            name="i-heroicons-arrow-path"
            class="search-spinner"
          />
        </div>

        <!-- Search Results Dropdown -->
        <div
          v-if="showSearchResults"
          class="search-results"
        >
          <button
            v-for="result in searchResults"
            :key="result.name"
            class="search-result-item"
            @mousedown.prevent="selectSearchResult(result)"
          >
            {{ result.name }}
          </button>
        </div>
      </div>

      <!-- Locate Me Button -->
      <button
        class="control-button locate-button"
        title="Find my location"
        :disabled="isLocating"
        @click="locateMe"
      >
        <UIcon
          :name="isLocating ? 'i-heroicons-arrow-path' : 'i-heroicons-map-pin'"
          :class="{ 'animate-spin': isLocating }"
        />
      </button>

      <!-- Radius Select with Label -->
      <div class="radius-wrapper">
        <label class="radius-label">Area:</label>
        <select
          :value="searchRadius"
          class="radius-select"
          title="Filter venues by area"
          @change="onRadiusChange(($event.target as HTMLSelectElement).value === 'view' ? 'view' : Number(($event.target as HTMLSelectElement).value))"
        >
          <option
            v-for="r in radiusOptions"
            :key="String(r)"
            :value="r"
          >
            {{ r === 'view' ? 'Visible map' : `${r} mi radius` }}
          </option>
        </select>
      </div>
    </div>

    <div
      ref="mapContainer"
      class="venue-map"
    />
  </div>
  <div
    v-else
    class="no-map"
  >
    <p>No venue locations available to display.</p>
  </div>
</template>

<style scoped>
.venue-map-container {
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid var(--border-color, #e5e5e5);
  margin-bottom: 1.5rem;
  position: relative;
}

.venue-map {
  height: 400px;
  width: 100%;
}

/* Map Controls */
.map-controls {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.95);
  border-bottom: 1px solid var(--border-color, #e5e5e5);
  align-items: center;
}

.search-container {
  flex: 1;
  position: relative;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.625rem;
  width: 1rem;
  height: 1rem;
  color: #6b7280;
  pointer-events: none;
}

.search-spinner {
  position: absolute;
  right: 0.625rem;
  width: 1rem;
  height: 1rem;
  color: #6b7280;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.625rem 0.5rem 2rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 0.25rem;
}

.search-result-item {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 0.875rem;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-result-item:hover {
  background: #f3f4f6;
}

.control-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  color: #374151;
  cursor: pointer;
  flex-shrink: 0;
}

.control-button:hover {
  background: #f3f4f6;
}

.control-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.radius-wrapper {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding-left: 0.5rem;
  flex-shrink: 0;
}

.radius-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
  white-space: nowrap;
}

.radius-select {
  padding: 0.5rem 0.5rem 0.5rem 0;
  border: none;
  font-size: 0.875rem;
  background: transparent;
  color: #374151;
  cursor: pointer;
}

.radius-select:focus {
  outline: none;
}

.radius-wrapper:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.no-map {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted, #666);
  background: var(--bg-muted, #f5f5f5);
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}

/* Fix Leaflet popup styling */
:deep(.leaflet-popup-content) {
  margin: 0.75rem;
}

:deep(.leaflet-popup-content a) {
  color: var(--primary-color, #3b82f6);
  text-decoration: none;
}

:deep(.leaflet-popup-content a:hover) {
  text-decoration: underline;
}

/* Venue label styling - hidden by default, shown when zoomed in */
:deep(.venue-label) {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  opacity: 0;
  pointer-events: none;
}

/* Show labels when map has show-labels class */
.venue-map.show-labels :deep(.venue-label) {
  opacity: 1;
  pointer-events: auto;
}
</style>
