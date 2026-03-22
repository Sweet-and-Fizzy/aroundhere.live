<script setup lang="ts">
const emit = defineEmits<{
  'update:venueId': [value: string | null]
  'update:locationName': [value: string]
  'update:locationAddress': [value: string]
  'update:locationLat': [value: number | null]
  'update:locationLng': [value: number | null]
}>()

const searchQuery = ref('')
const venues = ref<Array<{ id: string; name: string; slug: string; city: string | null }>>([])
const selectedVenue = ref<{ id: string; name: string } | null>(null)
const showCustomLocation = ref(false)
const searching = ref(false)
const locationName = ref('')
const locationAddress = ref('')

let searchTimeout: ReturnType<typeof setTimeout> | null = null

async function searchVenues() {
  if (searchQuery.value.length < 2) {
    venues.value = []
    return
  }

  searching.value = true
  try {
    const results = await $fetch('/api/venues/search', {
      query: { q: searchQuery.value, limit: 10 },
    })
    venues.value = (results as any).venues || results || []
  } catch {
    venues.value = []
  } finally {
    searching.value = false
  }
}

function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(searchVenues, 300)
}

function selectVenue(venue: { id: string; name: string }) {
  selectedVenue.value = venue
  searchQuery.value = venue.name
  venues.value = []
  showCustomLocation.value = false
  emit('update:venueId', venue.id)
  emit('update:locationName', '')
  emit('update:locationAddress', '')
  emit('update:locationLat', null)
  emit('update:locationLng', null)
}

function clearVenue() {
  selectedVenue.value = null
  searchQuery.value = ''
  emit('update:venueId', null)
}

function toggleCustomLocation() {
  showCustomLocation.value = true
  selectedVenue.value = null
  searchQuery.value = ''
  venues.value = []
  emit('update:venueId', null)
}

function onLocationNameChange() {
  emit('update:locationName', locationName.value)
}

function onLocationAddressChange() {
  emit('update:locationAddress', locationAddress.value)
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="!showCustomLocation">
      <label class="block text-sm font-medium text-gray-700 mb-1">Venue</label>
      <div class="relative">
        <UInput
          v-if="!selectedVenue"
          v-model="searchQuery"
          placeholder="Search for a venue..."
          size="sm"
          icon="i-heroicons-magnifying-glass"
          @input="onSearchInput"
        />
        <div
          v-else
          class="flex items-center gap-2"
        >
          <UInput
            :model-value="selectedVenue.name"
            disabled
            size="sm"
            class="flex-1"
          />
          <UButton
            icon="i-heroicons-x-mark"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="clearVenue"
          />
        </div>

        <!-- Search Results Dropdown -->
        <div
          v-if="venues.length > 0 && !selectedVenue"
          class="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto"
        >
          <button
            v-for="venue in venues"
            :key="venue.id"
            class="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-sm"
            @click="selectVenue(venue)"
          >
            <span class="font-medium">{{ venue.name }}</span>
            <span
              v-if="venue.city"
              class="text-gray-500 ml-1"
            >, {{ venue.city }}</span>
          </button>
        </div>

        <div
          v-if="searching"
          class="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-sm text-gray-500"
        >
          Searching...
        </div>
      </div>

      <button
        class="mt-2 text-sm text-primary-600 hover:text-primary-700"
        @click="toggleCustomLocation"
      >
        I don't see my venue - enter a custom location
      </button>
    </div>

    <!-- Custom Location Fields -->
    <div
      v-else
      class="space-y-3"
    >
      <div class="flex items-center justify-between">
        <label class="block text-sm font-medium text-gray-700">Custom Location</label>
        <button
          class="text-sm text-primary-600 hover:text-primary-700"
          @click="showCustomLocation = false; clearVenue()"
        >
          Search venues instead
        </button>
      </div>

      <div>
        <label class="block text-xs text-gray-500 mb-1">Location Name</label>
        <UInput
          v-model="locationName"
          placeholder="e.g., Community Center, Town Hall..."
          size="sm"
          @blur="onLocationNameChange"
        />
      </div>

      <div>
        <label class="block text-xs text-gray-500 mb-1">Address</label>
        <UInput
          v-model="locationAddress"
          placeholder="Full street address"
          size="sm"
          @blur="onLocationAddressChange"
        />
      </div>
    </div>
  </div>
</template>
