<script setup lang="ts">
import type { Map as LeafletMap } from 'leaflet'

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

const props = defineProps<{
  venues: Venue[]
  persistKey?: string // localStorage key for persisting map bounds
}>()

const emit = defineEmits<{
  visibleVenues: [venueIds: string[]]
}>()

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

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
  <div v-if="mappableVenues.length > 0" class="venue-map-container">
    <div ref="mapContainer" class="venue-map" />
  </div>
  <div v-else class="no-map">
    <p>No venue locations available to display.</p>
  </div>
</template>

<style scoped>
.venue-map-container {
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid var(--border-color, #e5e5e5);
  margin-bottom: 1.5rem;
}

.venue-map {
  height: 400px;
  width: 100%;
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
