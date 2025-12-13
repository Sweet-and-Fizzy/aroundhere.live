/**
 * Composable to track the current region based on map center
 * Updates when user pans the map to a different area
 */

interface Region {
  id: string
  name: string
  slug: string
  centroidLat?: number | null
  centroidLng?: number | null
}

interface RegionState {
  region: Region | null
  distance: number | null
  loading: boolean
  loaded: boolean  // True once we've fetched the region at least once
  error: string | null
}

// Global state - shared across all components
const state = reactive<RegionState>({
  region: null,
  distance: null,
  loading: false,
  loaded: false,
  error: null,
})

// Debounce timer
let updateTimeout: ReturnType<typeof setTimeout> | null = null

export function useCurrentRegion() {
  const config = useRuntimeConfig()

  /**
   * Update the current region based on lat/lng
   * Debounced to avoid too many API calls while panning
   */
  async function updateRegion(lat: number, lng: number, immediate = false) {
    // Clear any pending update
    if (updateTimeout) {
      clearTimeout(updateTimeout)
      updateTimeout = null
    }

    const doUpdate = async () => {
      state.loading = true
      state.error = null

      try {
        const data = await $fetch<{ region: Region | null; distance: number | null }>(
          '/api/regions/nearest',
          { params: { lat, lng } }
        )

        state.region = data.region
        state.distance = data.distance
        state.loaded = true
      } catch (err) {
        console.error('Failed to fetch nearest region:', err)
        state.error = 'Failed to determine region'
      } finally {
        state.loading = false
      }
    }

    if (immediate) {
      await doUpdate()
    } else {
      // Debounce by 500ms
      updateTimeout = setTimeout(doUpdate, 500)
    }
  }

  /**
   * Get the region name, falling back to config if not yet loaded
   */
  const regionName = computed(() => {
    return state.region?.name || config.public.regionName || 'the area'
  })

  /**
   * Get the region slug
   */
  const regionSlug = computed(() => {
    return state.region?.slug || null
  })

  return {
    // State
    region: computed(() => state.region),
    regionName,
    regionSlug,
    distance: computed(() => state.distance),
    loading: computed(() => state.loading),
    loaded: computed(() => state.loaded),
    error: computed(() => state.error),

    // Actions
    updateRegion,
  }
}
