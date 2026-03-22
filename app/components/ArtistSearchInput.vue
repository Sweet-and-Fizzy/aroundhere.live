<script setup lang="ts">
interface ArtistEntry {
  id?: string
  name: string
}

interface SearchResult {
  id: string
  name: string
  slug: string
  eventCount?: number
  spotifyMatchStatus?: string
}

interface SimilarResult extends SearchResult {
  similarity: number
}

const props = defineProps<{
  modelValue: ArtistEntry[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ArtistEntry[]]
}>()

const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searching = ref(false)
const showSearch = ref(false)
let searchTimeout: ReturnType<typeof setTimeout>

// Duplicate detection
const similarArtists = ref<SimilarResult[]>([])
const showDuplicateWarning = ref(false)
const pendingArtistName = ref('')

function updateValue(newVal: ArtistEntry[]) {
  emit('update:modelValue', newVal)
}

async function searchArtists() {
  if (searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }

  searching.value = true
  try {
    const result = await $fetch('/api/artists/search', {
      query: { q: searchQuery.value, limit: 10 },
    })
    searchResults.value = (result as any).artists || []
  } catch {
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

function onSearchInput() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(searchArtists, 300)
}

function addExistingArtist(artist: SearchResult) {
  if (props.modelValue.some(a => a.id === artist.id)) {
    return
  }
  updateValue([...props.modelValue, { id: artist.id, name: artist.name }])
  searchQuery.value = ''
  searchResults.value = []
  showSearch.value = false
}

async function createNewArtist() {
  const name = searchQuery.value.trim()
  if (name.length < 2) return

  // Check for duplicates with existing selections
  if (props.modelValue.some(a => a.name.toLowerCase() === name.toLowerCase())) {
    return
  }

  // Check for similar artists in the database
  try {
    const result = await $fetch('/api/artists/similar', {
      query: { name, threshold: 0.7, limit: 5 },
    })
    const similar = (result as any).similar || []

    if (similar.length > 0 && similar.some((a: SimilarResult) => a.similarity >= 0.85)) {
      similarArtists.value = similar
      pendingArtistName.value = name
      showDuplicateWarning.value = true
      return
    }
  } catch {
    // If similarity check fails, proceed anyway
  }

  doAddNewArtist(name)
}

function doAddNewArtist(name: string) {
  updateValue([...props.modelValue, { name }])
  searchQuery.value = ''
  searchResults.value = []
  showSearch.value = false
  showDuplicateWarning.value = false
  similarArtists.value = []
  pendingArtistName.value = ''
}

function confirmCreateArtist() {
  doAddNewArtist(pendingArtistName.value)
}

function cancelCreateArtist() {
  showDuplicateWarning.value = false
  similarArtists.value = []
  pendingArtistName.value = ''
}

function useSimilarArtist(artist: SimilarResult) {
  showDuplicateWarning.value = false
  similarArtists.value = []
  pendingArtistName.value = ''
  addExistingArtist(artist)
}

function removeArtist(index: number) {
  const updated = [...props.modelValue]
  updated.splice(index, 1)
  updateValue(updated)
}

function moveArtist(index: number, direction: 'up' | 'down') {
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= props.modelValue.length) return

  const updated = [...props.modelValue]
  const item = updated.splice(index, 1)[0]
  if (!item) return
  updated.splice(newIndex, 0, item)
  updateValue(updated)
}
</script>

<template>
  <div class="space-y-3">
    <!-- Selected Artists -->
    <div
      v-if="modelValue.length > 0"
      class="space-y-2"
    >
      <div
        v-for="(artist, index) in modelValue"
        :key="artist.id || artist.name"
        class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
      >
        <!-- Order Buttons -->
        <div class="flex flex-col gap-0.5">
          <button
            type="button"
            class="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="index === 0"
            title="Move up"
            @click="moveArtist(index, 'up')"
          >
            <UIcon
              name="i-heroicons-chevron-up"
              class="w-3 h-3"
            />
          </button>
          <button
            type="button"
            class="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="index === modelValue.length - 1"
            title="Move down"
            @click="moveArtist(index, 'down')"
          >
            <UIcon
              name="i-heroicons-chevron-down"
              class="w-3 h-3"
            />
          </button>
        </div>

        <!-- Artist Info -->
        <div class="flex-1 min-w-0 flex items-center gap-2">
          <span class="text-sm font-medium text-gray-900 truncate">{{ artist.name }}</span>
          <span
            v-if="index === 0 && modelValue.length > 1"
            class="text-[10px] text-gray-500 bg-gray-100 px-1 py-0.5 rounded"
          >
            headliner
          </span>
          <span
            v-if="!artist.id"
            class="text-[10px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded"
          >
            new
          </span>
        </div>

        <!-- Remove Button -->
        <button
          type="button"
          class="p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remove artist"
          @click="removeArtist(index)"
        >
          <UIcon
            name="i-heroicons-x-mark"
            class="w-4 h-4"
          />
        </button>
      </div>
    </div>

    <!-- Search/Add Section -->
    <div
      v-if="showSearch"
      class="bg-gray-50 rounded-lg p-3 space-y-3"
    >
      <div class="flex gap-2">
        <div class="relative flex-1">
          <UInput
            v-model="searchQuery"
            placeholder="Search or create artist..."
            icon="i-heroicons-magnifying-glass"
            size="sm"
            @input="onSearchInput"
            @keyup.enter="searchResults.length && searchResults[0] ? addExistingArtist(searchResults[0]) : createNewArtist()"
          />
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-heroicons-x-mark"
          @click="showSearch = false; searchQuery = ''; searchResults = []; showDuplicateWarning = false"
        />
      </div>

      <!-- Search Results -->
      <div
        v-if="searchResults.length > 0"
        class="space-y-1"
      >
        <button
          v-for="result in searchResults"
          :key="result.id"
          type="button"
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-white flex items-center justify-between gap-2 transition-colors"
          @click="addExistingArtist(result)"
        >
          <div class="min-w-0">
            <div class="font-medium text-sm truncate">
              {{ result.name }}
            </div>
            <div
              v-if="result.eventCount"
              class="text-xs text-gray-500"
            >
              {{ result.eventCount }} events
            </div>
          </div>
          <UIcon
            name="i-heroicons-plus"
            class="w-4 h-4 text-gray-400"
          />
        </button>
      </div>

      <!-- Create New Option -->
      <div
        v-if="searchQuery.length >= 2 && !searchResults.some(r => r.name.toLowerCase() === searchQuery.toLowerCase())"
        class="pt-2 border-t border-gray-200"
      >
        <button
          type="button"
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-white flex items-center gap-2 transition-colors text-primary-600"
          @click="createNewArtist"
        >
          <UIcon
            name="i-heroicons-plus-circle"
            class="w-4 h-4"
          />
          <span class="text-sm font-medium">Create "{{ searchQuery }}"</span>
        </button>
      </div>

      <div
        v-if="searching"
        class="text-center text-sm text-gray-500 py-2"
      >
        Searching...
      </div>

      <!-- Duplicate Warning -->
      <div
        v-if="showDuplicateWarning"
        class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3"
      >
        <div class="text-sm text-amber-800">
          <strong>Similar artists found!</strong> Did you mean one of these?
        </div>
        <div class="space-y-1">
          <button
            v-for="similar in similarArtists"
            :key="similar.id"
            type="button"
            class="w-full text-left px-3 py-2 bg-white rounded border hover:bg-amber-50 flex items-center justify-between"
            @click="useSimilarArtist(similar)"
          >
            <div>
              <span class="font-medium text-sm">{{ similar.name }}</span>
              <span class="text-xs text-gray-500 ml-2">{{ similar.eventCount }} events</span>
            </div>
            <span class="text-xs text-amber-600">{{ Math.round(similar.similarity * 100) }}% match</span>
          </button>
        </div>
        <div class="flex gap-2 pt-2 border-t border-amber-200">
          <UButton
            size="xs"
            color="warning"
            variant="soft"
            @click="confirmCreateArtist"
          >
            Create "{{ pendingArtistName }}" anyway
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            @click="cancelCreateArtist"
          >
            Cancel
          </UButton>
        </div>
      </div>
    </div>

    <!-- Add Artist Button -->
    <div v-if="!showSearch">
      <UButton
        size="sm"
        color="primary"
        variant="soft"
        icon="i-heroicons-plus"
        @click="showSearch = true"
      >
        Add Artist
      </UButton>
    </div>
  </div>
</template>
