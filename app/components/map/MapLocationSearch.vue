<script setup lang="ts">
interface SearchResult {
  name: string
  lat: number
  lng: number
}

interface Venue {
  id: string
  name: string
  latitude?: number | null
  longitude?: number | null
}

const props = defineProps<{
  venues?: Venue[]
  placeholder?: string
}>()

const emit = defineEmits<{
  select: [result: SearchResult]
}>()

const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const showSearchResults = ref(false)
const isSearching = ref(false)

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
    const nominatimResults: SearchResult[] = data.map((r: { display_name: string; lat: string; lon: string }) => ({
      name: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }))

    // Also search venues by name if venues provided
    const matchingVenues: SearchResult[] = props.venues
      ?.filter(v => v.latitude && v.longitude && v.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3)
      .map(v => ({
        name: `📍 ${v.name}`,
        lat: v.latitude!,
        lng: v.longitude!,
      })) || []

    searchResults.value = [...matchingVenues, ...nominatimResults].slice(0, 6)
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

function selectResult(result: SearchResult) {
  showSearchResults.value = false
  searchResults.value = []
  searchQuery.value = result.name.replace(/📍 /, '').split(',')[0] || ''
  emit('select', result)
}

function hideResults() {
  setTimeout(() => {
    showSearchResults.value = false
  }, 150)
}

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
  showSearchResults.value = false
}

// Expose methods for parent component
defineExpose({
  setQuery: (query: string) => {
    searchQuery.value = query
  },
  clearSearch,
})
</script>

<template>
  <div class="relative">
    <div class="relative">
      <UIcon
        name="i-heroicons-magnifying-glass"
        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
      />
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="placeholder || 'Search location...'"
        class="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        @focus="showSearchResults = searchResults.length > 0"
        @blur="hideResults"
      >
      <UIcon
        v-if="isSearching"
        name="i-heroicons-arrow-path"
        class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin"
      />
      <button
        v-else-if="searchQuery"
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        @click="clearSearch"
      >
        <UIcon
          name="i-heroicons-x-mark"
          class="w-4 h-4"
        />
      </button>
    </div>

    <!-- Search results dropdown -->
    <div
      v-if="showSearchResults && searchResults.length > 0"
      class="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
    >
      <button
        v-for="(result, index) in searchResults"
        :key="index"
        type="button"
        class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-start gap-2"
        @mousedown.prevent="selectResult(result)"
      >
        <UIcon
          name="i-heroicons-map-pin"
          class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0"
        />
        <span class="line-clamp-2">{{ result.name }}</span>
      </button>
    </div>
  </div>
</template>
