<script setup lang="ts">
interface Artist {
  id: string
  name: string
  slug: string
  genres?: string[]
  isLocal?: boolean
  spotifyId?: string | null
  spotifyName?: string | null
  spotifyMatchStatus?: string
  eventCount?: number
}

interface EventArtist {
  id: string
  artistId: string
  order: number
  setTime?: string | null
  artist: Artist
}

const props = defineProps<{
  eventId: string
  initialArtists: EventArtist[]
}>()

const emit = defineEmits<{
  updated: []
}>()

const toast = useToast()
const artists = ref<EventArtist[]>([...props.initialArtists])

// Watch for external changes
watch(() => props.initialArtists, (newArtists) => {
  artists.value = [...newArtists]
}, { deep: true })

// Search state
const searchQuery = ref('')
const searchResults = ref<Artist[]>([])
const searching = ref(false)
const showSearch = ref(false)
let searchTimeout: ReturnType<typeof setTimeout>

// Edit artist name state
const editingArtistId = ref<string | null>(null)
const editingName = ref('')

// Loading states
const saving = ref(false)
const removingId = ref<string | null>(null)

// Duplicate detection state
const similarArtists = ref<Artist[]>([])
const showDuplicateWarning = ref(false)
const pendingArtistName = ref('')

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

async function addExistingArtist(artist: Artist) {
  // Check if already added
  if (artists.value.some(a => a.artistId === artist.id)) {
    toast.add({ title: 'Artist already added', color: 'warning' })
    return
  }

  saving.value = true
  try {
    const result = await $fetch(`/api/events/${props.eventId}/artists`, {
      method: 'POST',
      body: { artistId: artist.id },
    })
    artists.value.push(result as EventArtist)
    searchQuery.value = ''
    searchResults.value = []
    showSearch.value = false
    emit('updated')
    toast.add({ title: `Added ${artist.name}`, color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.data?.message || 'Failed to add artist', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function createAndAddArtist() {
  const name = searchQuery.value.trim()
  if (name.length < 2) {
    toast.add({ title: 'Artist name too short', color: 'warning' })
    return
  }

  // Check for similar artists first
  try {
    const result = await $fetch('/api/artists/similar', {
      query: { name, threshold: 0.7, limit: 5 },
    })
    const similar = (result as any).similar || []

    // If there are highly similar artists, show warning
    if (similar.length > 0 && similar.some((a: any) => a.similarity >= 0.85)) {
      similarArtists.value = similar
      pendingArtistName.value = name
      showDuplicateWarning.value = true
      return
    }
  } catch {
    // If similarity check fails, proceed anyway
  }

  // No duplicates found, create the artist
  await doCreateArtist(name)
}

async function doCreateArtist(name: string) {
  saving.value = true
  try {
    const result = await $fetch(`/api/events/${props.eventId}/artists`, {
      method: 'POST',
      body: { artistName: name },
    })
    artists.value.push(result as EventArtist)
    searchQuery.value = ''
    searchResults.value = []
    showSearch.value = false
    showDuplicateWarning.value = false
    similarArtists.value = []
    pendingArtistName.value = ''
    emit('updated')
    toast.add({ title: `Created and added ${name}`, color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.data?.message || 'Failed to create artist', color: 'error' })
  } finally {
    saving.value = false
  }
}

function confirmCreateArtist() {
  doCreateArtist(pendingArtistName.value)
}

function cancelCreateArtist() {
  showDuplicateWarning.value = false
  similarArtists.value = []
  pendingArtistName.value = ''
}

function useSimilarArtist(artist: Artist) {
  showDuplicateWarning.value = false
  similarArtists.value = []
  pendingArtistName.value = ''
  addExistingArtist(artist)
}

async function removeArtist(artistId: string) {
  const artist = artists.value.find(a => a.artistId === artistId)
  if (!artist) return

  removingId.value = artistId
  try {
    await $fetch(`/api/events/${props.eventId}/artists/${artistId}`, {
      method: 'DELETE',
    })
    artists.value = artists.value.filter(a => a.artistId !== artistId)
    emit('updated')
    toast.add({ title: `Removed ${artist.artist.name}`, color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.data?.message || 'Failed to remove artist', color: 'error' })
  } finally {
    removingId.value = null
  }
}

async function moveArtist(artistId: string, direction: 'up' | 'down') {
  const index = artists.value.findIndex(a => a.artistId === artistId)
  if (index === -1) return

  const newOrder = direction === 'up' ? index : index + 2 // 1-indexed

  if (newOrder < 1 || newOrder > artists.value.length) return

  saving.value = true
  try {
    await $fetch(`/api/events/${props.eventId}/artists/${artistId}`, {
      method: 'PATCH',
      body: { order: newOrder },
    })

    // Refresh the list
    const result = await $fetch(`/api/events/${props.eventId}/artists`)
    artists.value = (result as any).artists || []
    emit('updated')
  } catch (error: any) {
    toast.add({ title: error.data?.message || 'Failed to reorder', color: 'error' })
  } finally {
    saving.value = false
  }
}

function startEditingName(artist: EventArtist) {
  editingArtistId.value = artist.artistId
  editingName.value = artist.artist.name
}

function cancelEditingName() {
  editingArtistId.value = null
  editingName.value = ''
}

async function saveArtistName(artistId: string) {
  const newName = editingName.value.trim()
  if (newName.length < 1) {
    toast.add({ title: 'Name cannot be empty', color: 'warning' })
    return
  }

  saving.value = true
  try {
    const result = await $fetch(`/api/artists/${artistId}`, {
      method: 'PATCH',
      body: { name: newName },
    })

    // Update local state
    const artist = artists.value.find(a => a.artistId === artistId)
    if (artist) {
      artist.artist.name = (result as any).name
      artist.artist.slug = (result as any).slug
    }

    editingArtistId.value = null
    editingName.value = ''
    emit('updated')
    toast.add({ title: 'Artist name updated', color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.data?.message || 'Failed to update name', color: 'error' })
  } finally {
    saving.value = false
  }
}

function getSpotifyStatusColor(status?: string): string {
  switch (status) {
    case 'VERIFIED': return 'text-green-600'
    case 'AUTO_MATCHED': return 'text-blue-600'
    case 'NEEDS_REVIEW': return 'text-yellow-600'
    case 'NO_MATCH': return 'text-gray-400'
    default: return 'text-purple-600'
  }
}
</script>

<template>
  <div class="space-y-3">
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
            @keyup.enter="searchResults.length ? addExistingArtist(searchResults[0]) : createAndAddArtist()"
          />
        </div>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-x-mark"
          @click="showSearch = false; searchQuery = ''; searchResults = []"
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
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-white flex items-center justify-between gap-2 transition-colors"
          :disabled="saving"
          @click="addExistingArtist(result)"
        >
          <div class="min-w-0">
            <div class="font-medium text-sm truncate">
              {{ result.name }}
            </div>
            <div class="text-xs text-gray-500 flex items-center gap-2">
              <span>{{ result.eventCount }} events</span>
              <span
                v-if="result.spotifyMatchStatus"
                :class="getSpotifyStatusColor(result.spotifyMatchStatus)"
              >
                {{ result.spotifyMatchStatus === 'VERIFIED' ? '✓ Spotify' : result.spotifyMatchStatus === 'AUTO_MATCHED' ? '○ Spotify' : '' }}
              </span>
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
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-white flex items-center justify-between gap-2 transition-colors text-primary-600"
          :disabled="saving"
          @click="createAndAddArtist"
        >
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-plus-circle"
              class="w-4 h-4"
            />
            <span class="text-sm font-medium">Create "{{ searchQuery }}"</span>
          </div>
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
            class="w-full text-left px-3 py-2 bg-white rounded border hover:bg-amber-50 flex items-center justify-between"
            @click="useSimilarArtist(similar)"
          >
            <div>
              <span class="font-medium text-sm">{{ similar.name }}</span>
              <span class="text-xs text-gray-500 ml-2">{{ similar.eventCount }} events</span>
            </div>
            <span class="text-xs text-amber-600">{{ Math.round((similar as any).similarity * 100) }}% match</span>
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

    <!-- Artist List -->
    <div
      v-if="artists.length > 0"
      class="space-y-2"
    >
      <div
        v-for="(ea, index) in artists"
        :key="ea.id"
        class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
      >
        <!-- Order Buttons -->
        <div class="flex flex-col gap-0.5">
          <button
            class="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="index === 0 || saving"
            title="Move up"
            @click="moveArtist(ea.artistId, 'up')"
          >
            <UIcon
              name="i-heroicons-chevron-up"
              class="w-3 h-3"
            />
          </button>
          <button
            class="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="index === artists.length - 1 || saving"
            title="Move down"
            @click="moveArtist(ea.artistId, 'down')"
          >
            <UIcon
              name="i-heroicons-chevron-down"
              class="w-3 h-3"
            />
          </button>
        </div>

        <!-- Order Number -->
        <span class="w-5 text-xs text-gray-400 font-mono text-center">
          {{ index + 1 }}
        </span>

        <!-- Artist Info -->
        <div class="flex-1 min-w-0">
          <!-- Editing Mode -->
          <div
            v-if="editingArtistId === ea.artistId"
            class="flex items-center gap-2"
          >
            <UInput
              v-model="editingName"
              size="xs"
              class="flex-1"
              @keyup.enter="saveArtistName(ea.artistId)"
              @keyup.escape="cancelEditingName"
            />
            <UButton
              size="xs"
              color="primary"
              icon="i-heroicons-check"
              :loading="saving"
              @click="saveArtistName(ea.artistId)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="cancelEditingName"
            />
          </div>

          <!-- Display Mode -->
          <div
            v-else
            class="flex items-center gap-2"
          >
            <NuxtLink
              :to="`/artists/${ea.artist.slug}`"
              class="font-medium text-sm truncate text-gray-900 hover:text-primary-600 transition-colors"
              @click.stop
            >
              {{ ea.artist.name }}
            </NuxtLink>
            <span
              v-if="index === 0 && artists.length > 1"
              class="text-[10px] text-gray-500 bg-gray-100 px-1 py-0.5 rounded"
            >
              headliner
            </span>
            <a
              v-if="ea.artist.spotifyId"
              :href="`https://open.spotify.com/artist/${ea.artist.spotifyId}`"
              target="_blank"
              class="text-green-600 hover:text-green-700"
              title="View on Spotify"
              @click.stop
            >
              <UIcon
                name="i-heroicons-arrow-top-right-on-square"
                class="w-3 h-3"
              />
            </a>
            <NuxtLink
              :to="`/admin/spotify?search=${encodeURIComponent(ea.artist.name)}`"
              class="text-gray-400 hover:text-gray-600"
              title="Edit Spotify link"
              @click.stop
            >
              <UIcon
                name="i-heroicons-musical-note"
                class="w-3 h-3"
              />
            </NuxtLink>
          </div>

          <!-- Spotify Status -->
          <div
            v-if="!editingArtistId && (ea.artist.spotifyId || ea.artist.spotifyMatchStatus)"
            class="text-xs"
            :class="getSpotifyStatusColor(ea.artist.spotifyMatchStatus)"
          >
            {{ ea.artist.spotifyId ? (ea.artist.spotifyMatchStatus === 'VERIFIED' ? 'Verified on Spotify' : 'On Spotify') :
              ea.artist.spotifyMatchStatus === 'NO_MATCH' ? 'Not on Spotify' :
              ea.artist.spotifyMatchStatus === 'NEEDS_REVIEW' ? 'Needs review' :
              'Pending match' }}
          </div>
        </div>

        <!-- Action Buttons -->
        <div
          v-if="editingArtistId !== ea.artistId"
          class="flex items-center gap-1"
        >
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-pencil"
            title="Edit name"
            @click="startEditingName(ea)"
          />
          <NuxtLink
            :to="{ path: '/admin/artists', query: { q: ea.artist.name } }"
            class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="Manage artist"
          >
            <UIcon
              name="i-heroicons-cog-6-tooth"
              class="w-4 h-4"
            />
          </NuxtLink>
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="i-heroicons-trash"
            title="Remove from event"
            :loading="removingId === ea.artistId"
            @click="removeArtist(ea.artistId)"
          />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!showSearch"
      class="text-center py-4 text-gray-500 text-sm"
    >
      No artists linked to this event.
    </div>

    <!-- Add Artist Button -->
    <div
      v-if="!showSearch"
      class="pt-2"
    >
      <UButton
        size="xs"
        color="primary"
        variant="soft"
        icon="i-heroicons-plus"
        block
        @click="showSearch = true"
      >
        Add Artist
      </UButton>
    </div>
  </div>
</template>
