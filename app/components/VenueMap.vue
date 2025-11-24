<script setup lang="ts">
interface Venue {
  id: string
  name: string
  slug: string
  latitude?: number
  longitude?: number
  city?: string
  address?: string
}

const props = defineProps<{
  venues: Venue[]
}>()

const mapContainer = ref<HTMLElement | null>(null)
const map = ref<L.Map | null>(null)

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
  delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })

  if (!mapContainer.value) return

  // Initialize map
  map.value = L.map(mapContainer.value).setView(
    mapCenter.value as [number, number],
    mappableVenues.value.length > 1 ? 10 : 13
  )

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map.value)

  // Add markers for each venue
  for (const venue of mappableVenues.value) {
    if (venue.latitude && venue.longitude) {
      const marker = L.marker([venue.latitude, venue.longitude])
        .addTo(map.value)
        .bindPopup(`
          <strong>${venue.name}</strong>
          ${venue.address ? `<br>${venue.address}` : ''}
          ${venue.city ? `<br>${venue.city}` : ''}
          <br><a href="/venues/${venue.slug}">View venue</a>
        `)
    }
  }

  // Fit bounds to show all markers if multiple venues
  if (mappableVenues.value.length > 1) {
    const bounds = L.latLngBounds(
      mappableVenues.value.map(v => [v.latitude!, v.longitude!] as [number, number])
    )
    map.value.fitBounds(bounds, { padding: [30, 30] })
  }
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
</style>
