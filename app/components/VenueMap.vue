<script setup lang="ts">
import type { Map as LeafletMap, Marker, Tooltip } from 'leaflet'

interface Venue {
  id: string
  name: string
  slug: string
  latitude?: number | null
  longitude?: number | null
  city?: string | null
  address?: string | null
}

const props = defineProps<{
  venues: Venue[]
}>()

const mapContainer = ref<HTMLElement | null>(null)
const map = ref<LeafletMap | null>(null)
const isMounted = ref(true)

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

  // Check if component was unmounted during async imports
  if (!isMounted.value || !mapContainer.value) return

  // Create custom icon with proper anchor points
  const customIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [12, -28],
    shadowSize: [41, 41],
    shadowAnchor: [12, 41],
  })

  // Initialize map
  map.value = L.map(mapContainer.value).setView(
    mapCenter.value as [number, number],
    mappableVenues.value.length > 1 ? 10 : 13
  )

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map.value as LeafletMap)

  // Track markers and tooltips for zoom-based visibility
  const markers: { marker: Marker; tooltip: Tooltip }[] = []

  // Add markers for each venue with permanent labels
  for (const venue of mappableVenues.value) {
    if (venue.latitude && venue.longitude) {
      const marker = L.marker([venue.latitude, venue.longitude])
        .addTo(map.value as LeafletMap)
        .bindPopup(`
          <strong>${venue.name}</strong>
          ${venue.address ? `<br>${venue.address}` : ''}
          ${venue.city ? `<br>${venue.city}` : ''}
          <br><a href="/venues/${venue.slug}">View details</a>
        `)

      // Add permanent tooltip with venue name
      const tooltip = marker.bindTooltip(venue.name, {
        permanent: true,
        direction: 'top',
        offset: [0, -10],
        className: 'venue-label',
      }).getTooltip()

      if (tooltip) {
        markers.push({ marker, tooltip })
      }
    }
  }

  // Show/hide labels based on zoom level
  const LABEL_MIN_ZOOM = 11

  function updateLabelVisibility() {
    const currentZoom = map.value?.getZoom() || 0
    const showLabels = currentZoom >= LABEL_MIN_ZOOM

    markers.forEach(({ marker }) => {
      if (showLabels) {
        marker.openTooltip()
      } else {
        marker.closeTooltip()
      }
    })
  }

  // Set initial visibility
  updateLabelVisibility()

  // Update on zoom
  map.value.on('zoomend', updateLabelVisibility)

  // Fit bounds to show all markers if multiple venues
  if (mappableVenues.value.length > 1) {
    const bounds = L.latLngBounds(
      mappableVenues.value.map(v => [v.latitude!, v.longitude!] as [number, number])
    )
    map.value.fitBounds(bounds, { padding: [30, 30] })
  }

  // Invalidate size after a brief delay to ensure container is fully rendered
  setTimeout(() => {
    if (map.value && isMounted.value) {
      map.value.invalidateSize()
    }
  }, 100)
})

onUnmounted(() => {
  isMounted.value = false
  if (map.value) {
    map.value.off('zoomend')
    map.value.remove()
    map.value = null
  }
})
</script>

<template>
  <div
    v-if="mappableVenues.length > 0"
    class="venue-map-container"
  >
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

/* Venue label styling */
:deep(.venue-label) {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

:deep(.venue-label::before) {
  border-top-color: #ccc;
}
</style>
