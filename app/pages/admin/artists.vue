<script setup lang="ts">
import { refDebounced } from '@vueuse/core'

definePageMeta({
  middleware: 'admin',
})

const route = useRoute()
const toast = useToast()
const { getGenreLabel, getGenreBadgeClasses } = useGenreLabels()

// Search and pagination state - initialize from URL query
const searchQuery = ref((route.query.q as string) || '')
const currentPage = ref(1)
const limit = 50

// Filter state
const musicbrainzStatusFilter = ref<string | undefined>(undefined)

// Debounced search
const debouncedSearch = refDebounced(searchQuery, 300)

// Fetch artists
const { data: response, refresh, status } = await useFetch('/api/admin/artists', {
  query: {
    q: debouncedSearch,
    page: currentPage,
    limit,
    sort: 'eventCount',
    order: 'desc',
    musicbrainzStatus: musicbrainzStatusFilter,
  },
  watch: [debouncedSearch, currentPage, musicbrainzStatusFilter],
})

const artists = computed(() => response.value?.artists || [])
const pagination = computed(() => response.value?.pagination || { page: 1, total: 0, totalPages: 1 })

// Reset to page 1 when search changes
watch(debouncedSearch, () => {
  currentPage.value = 1
})

// Edit modal state
const editingArtist = ref<any>(null)
const editForm = ref({
  name: '',
  isLocal: false,
})
const saving = ref(false)

function openEditModal(artist: any) {
  editingArtist.value = artist
  editForm.value = {
    name: artist.name,
    isLocal: artist.isLocal,
  }
}

function closeEditModal() {
  editingArtist.value = null
}

async function saveArtist() {
  if (!editingArtist.value) return

  saving.value = true
  try {
    await $fetch(`/api/artists/${editingArtist.value.id}`, {
      method: 'PATCH',
      body: {
        name: editForm.value.name,
        isLocal: editForm.value.isLocal,
      },
    })
    toast.add({
      title: 'Artist updated',
      color: 'success',
    })
    closeEditModal()
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error updating artist',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

function getSpotifyStatusIcon(status: string) {
  switch (status) {
    case 'VERIFIED':
      return 'i-heroicons-check-badge'
    case 'MATCHED':
      return 'i-heroicons-check-circle'
    case 'NOT_FOUND':
      return 'i-heroicons-x-circle'
    case 'PENDING':
    default:
      return 'i-heroicons-clock'
  }
}

function getSpotifyStatusIconClass(status: string) {
  switch (status) {
    case 'VERIFIED':
      return 'text-green-600'
    case 'MATCHED':
      return 'text-blue-500'
    case 'NOT_FOUND':
      return 'text-gray-400'
    case 'PENDING':
    default:
      return 'text-yellow-500'
  }
}

async function deleteArtist(artist: any) {
  const eventWarning = artist.eventCount > 0 ? `\n\nThis will remove them from ${artist.eventCount} event(s).` : ''
  const favoriteWarning = artist.favoriteCount > 0 ? `\n${artist.favoriteCount} user(s) have favorited this artist.` : ''

  if (!confirm(`Delete "${artist.name}"?${eventWarning}${favoriteWarning}`)) {
    return
  }

  try {
    await $fetch(`/api/admin/artists/${artist.id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Artist deleted',
      color: 'success',
    })
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error deleting artist',
      description: error.data?.message || error.message,
      color: 'error',
    })
  }
}

// Spotify search modal state
interface SpotifySearchResult {
  id: string
  name: string
  popularity: number
  genres: string[]
  imageUrl: string | null
  spotifyUrl: string
}

const showSpotifyModal = ref(false)
const spotifySearchArtist = ref<any>(null)
const spotifySearchQuery = ref('')
const spotifySearchResults = ref<SpotifySearchResult[]>([])
const spotifySearching = ref(false)
const spotifySaving = ref(false)

function openSpotifyModal(artist: any) {
  spotifySearchArtist.value = artist
  spotifySearchQuery.value = artist.name
  spotifySearchResults.value = []
  showSpotifyModal.value = true
  searchSpotify()
}

function closeSpotifyModal() {
  showSpotifyModal.value = false
  spotifySearchArtist.value = null
}

async function searchSpotify() {
  if (!spotifySearchQuery.value.trim()) return

  spotifySearching.value = true
  try {
    const result = await $fetch('/api/spotify/search', {
      query: { q: spotifySearchQuery.value, limit: 10 },
    })
    spotifySearchResults.value = (result as any).artists || []
  } catch (error) {
    console.error('Spotify search failed:', error)
  } finally {
    spotifySearching.value = false
  }
}

async function selectSpotifyMatch(spotifyId: string) {
  if (!spotifySearchArtist.value) return

  spotifySaving.value = true
  try {
    await $fetch(`/api/spotify/artists/${spotifySearchArtist.value.id}`, {
      method: 'PATCH',
      body: { spotifyId },
    })
    toast.add({
      title: 'Spotify match updated',
      color: 'success',
    })
    closeSpotifyModal()
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error updating Spotify match',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    spotifySaving.value = false
  }
}

async function clearSpotifyMatch() {
  if (!spotifySearchArtist.value) return

  spotifySaving.value = true
  try {
    await $fetch(`/api/spotify/artists/${spotifySearchArtist.value.id}`, {
      method: 'PATCH',
      body: { status: 'NO_MATCH' },
    })
    toast.add({
      title: 'Marked as not on Spotify',
      color: 'success',
    })
    closeSpotifyModal()
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error updating artist',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    spotifySaving.value = false
  }
}

// Merge modal state
const showMergeModal = ref(false)
const mergeSourceArtist = ref<any>(null)
const mergeSearchQuery = ref('')
const mergeSearchResults = ref<any[]>([])
const mergeSearching = ref(false)
const merging = ref(false)

function openMergeModal(artist: any) {
  mergeSourceArtist.value = artist
  mergeSearchQuery.value = ''
  mergeSearchResults.value = []
  showMergeModal.value = true
}

function closeMergeModal() {
  showMergeModal.value = false
  mergeSourceArtist.value = null
}

async function searchMergeTargets() {
  if (!mergeSearchQuery.value.trim() || mergeSearchQuery.value.length < 2) {
    mergeSearchResults.value = []
    return
  }

  mergeSearching.value = true
  try {
    const result = await $fetch('/api/admin/artists', {
      query: { q: mergeSearchQuery.value, limit: 10 },
    })
    // Filter out the source artist from results
    mergeSearchResults.value = ((result as any).artists || []).filter(
      (a: any) => a.id !== mergeSourceArtist.value?.id
    )
  } catch (error) {
    console.error('Search failed:', error)
    mergeSearchResults.value = []
  } finally {
    mergeSearching.value = false
  }
}

async function mergeIntoArtist(targetArtist: any) {
  if (!mergeSourceArtist.value) return

  const confirmMsg = `Merge "${mergeSourceArtist.value.name}" into "${targetArtist.name}"?\n\nThis will:\n- Move ${mergeSourceArtist.value.eventCount} event(s) to "${targetArtist.name}"\n- Move ${mergeSourceArtist.value.favoriteCount} favorite(s)\n- Delete "${mergeSourceArtist.value.name}"\n\nThis cannot be undone.`

  if (!confirm(confirmMsg)) return

  merging.value = true
  try {
    const result = await $fetch(`/api/admin/artists/${mergeSourceArtist.value.id}/merge`, {
      method: 'POST',
      body: { targetArtistId: targetArtist.id },
    })
    toast.add({
      title: 'Artists merged',
      description: `${(result as any).eventsMoved} events and ${(result as any).favoritesMoved} favorites moved`,
      color: 'success',
    })
    closeMergeModal()
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error merging artists',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    merging.value = false
  }
}

// MusicBrainz modal state
interface MusicBrainzSearchResult {
  id: string
  name: string
  disambiguation: string | null
  country: string | null
  type: string | null
  score: number
  tags: string[]
}

const showMusicBrainzModal = ref(false)
const musicBrainzSearchArtist = ref<any>(null)
const musicBrainzSearchQuery = ref('')
const musicBrainzSearchResults = ref<MusicBrainzSearchResult[]>([])
const musicBrainzSearching = ref(false)
const musicBrainzSaving = ref(false)

function openMusicBrainzModal(artist: any) {
  musicBrainzSearchArtist.value = artist
  musicBrainzSearchQuery.value = artist.name
  musicBrainzSearchResults.value = []
  showMusicBrainzModal.value = true
  searchMusicBrainz()
}

function closeMusicBrainzModal() {
  showMusicBrainzModal.value = false
  musicBrainzSearchArtist.value = null
}

async function searchMusicBrainz() {
  if (!musicBrainzSearchQuery.value.trim()) return

  musicBrainzSearching.value = true
  try {
    const result = await $fetch('/api/musicbrainz/search', {
      query: { q: musicBrainzSearchQuery.value, limit: 10 },
    })
    musicBrainzSearchResults.value = (result as any).artists || []
  } catch (error) {
    console.error('MusicBrainz search failed:', error)
  } finally {
    musicBrainzSearching.value = false
  }
}

async function selectMusicBrainzMatch(musicbrainzId: string) {
  if (!musicBrainzSearchArtist.value) return

  musicBrainzSaving.value = true
  try {
    await $fetch(`/api/musicbrainz/artists/${musicBrainzSearchArtist.value.id}`, {
      method: 'PATCH',
      body: { musicbrainzId },
    })
    toast.add({
      title: 'MusicBrainz match updated',
      color: 'success',
    })
    closeMusicBrainzModal()
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error updating MusicBrainz match',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    musicBrainzSaving.value = false
  }
}

async function clearMusicBrainzMatch() {
  if (!musicBrainzSearchArtist.value) return

  musicBrainzSaving.value = true
  try {
    await $fetch(`/api/musicbrainz/artists/${musicBrainzSearchArtist.value.id}`, {
      method: 'PATCH',
      body: { status: 'NO_MATCH' },
    })
    toast.add({
      title: 'Marked as not on MusicBrainz',
      color: 'success',
    })
    closeMusicBrainzModal()
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error updating artist',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    musicBrainzSaving.value = false
  }
}

function getMusicBrainzStatusIcon(status: string) {
  switch (status) {
    case 'VERIFIED':
      return 'i-heroicons-check-badge'
    case 'AUTO_MATCHED':
      return 'i-heroicons-check-circle'
    case 'NEEDS_REVIEW':
      return 'i-heroicons-exclamation-triangle'
    case 'NO_MATCH':
      return 'i-heroicons-x-circle'
    case 'PENDING':
    default:
      return 'i-heroicons-clock'
  }
}

function getMusicBrainzStatusIconClass(status: string) {
  switch (status) {
    case 'VERIFIED':
      return 'text-green-600'
    case 'AUTO_MATCHED':
      return 'text-blue-500'
    case 'NEEDS_REVIEW':
      return 'text-amber-500'
    case 'NO_MATCH':
      return 'text-gray-400'
    case 'PENDING':
    default:
      return 'text-yellow-500'
  }
}

// Duplicates detection
const showDuplicatesModal = ref(false)
const duplicates = ref<any[]>([])
const loadingDuplicates = ref(false)

async function findDuplicates() {
  loadingDuplicates.value = true
  showDuplicatesModal.value = true
  try {
    const result = await $fetch('/api/admin/artists/duplicates', {
      query: { threshold: 0.8, limit: 50 },
    })
    duplicates.value = (result as any).duplicates || []
  } catch (error) {
    console.error('Failed to find duplicates:', error)
    duplicates.value = []
  } finally {
    loadingDuplicates.value = false
  }
}

async function quickMerge(pair: any, keepFirst: boolean) {
  const source = keepFirst ? pair.artist2 : pair.artist1
  const target = keepFirst ? pair.artist1 : pair.artist2

  if (!confirm(`Merge "${source.name}" into "${target.name}"?`)) return

  try {
    await $fetch(`/api/admin/artists/${source.id}/merge`, {
      method: 'POST',
      body: { targetArtistId: target.id },
    })
    toast.add({ title: 'Merged successfully', color: 'success' })
    // Remove this pair from the list
    duplicates.value = duplicates.value.filter((d) => d !== pair)
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error merging',
      description: error.data?.message || error.message,
      color: 'error',
    })
  }
}

useSeoMeta({
  title: 'Admin - Artists',
  description: 'Manage artists',
})
</script>

<template>
  <div class="px-4 py-8 max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">
        Artists
      </h1>
      <div class="flex items-center gap-4">
        <UButton
          color="warning"
          variant="soft"
          icon="i-heroicons-document-duplicate"
          @click="findDuplicates"
        >
          Find Duplicates
        </UButton>
        <div class="text-sm text-gray-500">
          {{ pagination.total }} total artists
        </div>
      </div>
    </div>

    <!-- Search and Filters -->
    <div class="mb-6 flex flex-wrap gap-4 items-center">
      <UInput
        v-model="searchQuery"
        placeholder="Search artists..."
        icon="i-heroicons-magnifying-glass"
        size="lg"
        class="max-w-md"
      />
      <USelectMenu
        v-model="musicbrainzStatusFilter"
        :items="[
          { label: 'Needs Review', value: 'NEEDS_REVIEW' },
          { label: 'Pending', value: 'PENDING' },
          { label: 'Auto Matched', value: 'AUTO_MATCHED' },
          { label: 'No Match', value: 'NO_MATCH' },
          { label: 'Verified', value: 'VERIFIED' },
        ]"
        placeholder="All MusicBrainz"
        value-key="value"
        class="w-48"
        :ui="{ trigger: 'cursor-pointer' }"
      >
        <template #trailing>
          <UButton
            v-if="musicbrainzStatusFilter"
            color="neutral"
            variant="link"
            icon="i-heroicons-x-mark"
            size="xs"
            aria-label="Clear filter"
            @click.stop="musicbrainzStatusFilter = undefined"
          />
          <UIcon
            v-else
            name="i-heroicons-chevron-down"
            class="w-4 h-4 text-gray-400"
          />
        </template>
      </USelectMenu>
    </div>

    <!-- Loading state -->
    <div
      v-if="status === 'pending' && artists.length === 0"
      class="flex justify-center py-12"
    >
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-8 h-8 animate-spin text-gray-400"
      />
    </div>

    <!-- Artists table -->
    <div
      v-else
      class="bg-white rounded-lg shadow overflow-hidden"
    >
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Genres
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Events
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Favorites
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Spotify
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                MusicBrainz
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr
              v-for="artist in artists"
              :key="artist.id"
              class="hover:bg-gray-50"
            >
              <td class="px-6 py-4">
                <div class="font-medium text-gray-900">
                  {{ artist.name }}
                </div>
                <span
                  v-if="artist.isLocal"
                  class="px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded"
                >
                  Local
                </span>
                <!-- Recent events for research -->
                <div
                  v-if="artist.recentEvents?.length"
                  class="mt-1 space-y-0.5"
                >
                  <NuxtLink
                    v-for="evt in artist.recentEvents"
                    :key="evt.id"
                    :to="`/events/${evt.slug}`"
                    class="block text-xs text-primary-600 hover:text-primary-800 hover:underline truncate max-w-xs"
                    :title="`${evt.title} at ${evt.venueName || 'TBA'}`"
                    target="_blank"
                  >
                    {{ evt.venueName || 'TBA' }} · {{ new Date(evt.startsAt).toLocaleDateString() }}
                  </NuxtLink>
                </div>
              </td>
              <td class="px-6 py-4">
                <div class="flex flex-wrap gap-1 max-w-xs">
                  <span
                    v-for="genre in artist.genres.slice(0, 3)"
                    :key="genre"
                    class="px-1.5 py-0.5 text-xs font-medium rounded"
                    :class="getGenreBadgeClasses(genre)"
                  >
                    {{ getGenreLabel(genre) }}
                  </span>
                  <span
                    v-if="artist.genres.length > 3"
                    class="text-xs text-gray-500"
                  >
                    +{{ artist.genres.length - 3 }}
                  </span>
                  <span
                    v-if="artist.genres.length === 0"
                    class="text-xs text-gray-400"
                  >
                    No genres
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ artist.eventCount }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ artist.favoriteCount }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <button
                  class="flex items-center gap-2 hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 transition-colors"
                  title="Click to edit Spotify match"
                  @click="openSpotifyModal(artist)"
                >
                  <UIcon
                    :name="getSpotifyStatusIcon(artist.spotifyMatchStatus)"
                    class="w-4 h-4 flex-shrink-0"
                    :class="getSpotifyStatusIconClass(artist.spotifyMatchStatus)"
                  />
                  <span
                    v-if="artist.spotifyName"
                    class="text-sm text-gray-700 truncate max-w-32"
                    :title="artist.spotifyName"
                  >
                    {{ artist.spotifyName }}
                  </span>
                  <span
                    v-else-if="artist.spotifyId"
                    class="text-xs text-gray-400 truncate max-w-24"
                    :title="`ID: ${artist.spotifyId}`"
                  >
                    {{ artist.spotifyId.slice(0, 8) }}...
                  </span>
                  <span
                    v-else
                    class="text-xs text-gray-400"
                  >
                    {{ artist.spotifyMatchStatus === 'NO_MATCH' ? 'Not on Spotify' : 'Click to match' }}
                  </span>
                </button>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <button
                  class="flex items-center gap-2 hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 transition-colors"
                  title="Click to edit MusicBrainz match"
                  @click="openMusicBrainzModal(artist)"
                >
                  <UIcon
                    :name="getMusicBrainzStatusIcon(artist.musicbrainzMatchStatus)"
                    class="w-4 h-4 flex-shrink-0"
                    :class="getMusicBrainzStatusIconClass(artist.musicbrainzMatchStatus)"
                  />
                  <span
                    v-if="artist.musicbrainzId"
                    class="text-xs text-gray-400 truncate max-w-20"
                    :title="`MBID: ${artist.musicbrainzId}`"
                  >
                    {{ artist.musicbrainzMatchConfidence ? `${Math.round(artist.musicbrainzMatchConfidence * 100)}%` : 'Matched' }}
                  </span>
                  <span
                    v-else
                    class="text-xs text-gray-400"
                  >
                    {{ artist.musicbrainzMatchStatus === 'NO_MATCH' ? 'No match' : 'Click to match' }}
                  </span>
                </button>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex justify-end gap-2">
                  <button
                    class="p-1.5 text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded"
                    title="Edit artist"
                    @click="openEditModal(artist)"
                  >
                    <UIcon
                      name="i-heroicons-pencil-square"
                      class="w-5 h-5"
                    />
                  </button>
                  <button
                    class="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded"
                    title="Merge into another artist"
                    @click="openMergeModal(artist)"
                  >
                    <UIcon
                      name="i-heroicons-arrows-pointing-in"
                      class="w-5 h-5"
                    />
                  </button>
                  <a
                    v-if="artist.spotifyId"
                    :href="`https://open.spotify.com/artist/${artist.spotifyId}`"
                    target="_blank"
                    class="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded"
                    title="View on Spotify"
                  >
                    <UIcon
                      name="i-heroicons-musical-note"
                      class="w-5 h-5"
                    />
                  </a>
                  <button
                    class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                    title="Delete artist"
                    @click="deleteArtist(artist)"
                  >
                    <UIcon
                      name="i-heroicons-trash"
                      class="w-5 h-5"
                    />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="artists.length === 0">
              <td
                colspan="7"
                class="px-6 py-8 text-center text-gray-500"
              >
                {{ searchQuery ? 'No artists found matching your search.' : 'No artists found.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div
        v-if="pagination.totalPages > 1"
        class="bg-gray-50 px-6 py-3 flex items-center justify-between border-t border-gray-200"
      >
        <div class="text-sm text-gray-500">
          Showing {{ (pagination.page - 1) * limit + 1 }} to {{ Math.min(pagination.page * limit, pagination.total) }} of {{ pagination.total }}
        </div>
        <div class="flex gap-2">
          <UButton
            :disabled="currentPage <= 1"
            variant="outline"
            size="sm"
            @click="currentPage--"
          >
            Previous
          </UButton>
          <UButton
            :disabled="currentPage >= pagination.totalPages"
            variant="outline"
            size="sm"
            @click="currentPage++"
          >
            Next
          </UButton>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <UModal
      :open="!!editingArtist"
      @close="closeEditModal"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                Edit Artist
              </h3>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="closeEditModal"
              />
            </div>
          </template>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <UInput
                v-model="editForm.name"
                placeholder="Artist name"
              />
            </div>

            <div class="flex items-center gap-2">
              <USwitch v-model="editForm.isLocal" />
              <span class="text-sm text-gray-700">Local artist</span>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                @click="closeEditModal"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                :loading="saving"
                @click="saveArtist"
              >
                Save
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Spotify Search Modal -->
    <UModal
      :open="showSpotifyModal"
      @close="closeSpotifyModal"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">
                  Match to Spotify
                </h3>
                <p class="text-sm text-gray-500">
                  {{ spotifySearchArtist?.name }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="closeSpotifyModal"
              />
            </div>
          </template>

          <div class="space-y-4">
            <!-- Search Input -->
            <div class="flex gap-2">
              <UInput
                v-model="spotifySearchQuery"
                placeholder="Search Spotify..."
                class="flex-1"
                @keyup.enter="searchSpotify"
              />
              <UButton
                :loading="spotifySearching"
                @click="searchSpotify"
              >
                Search
              </UButton>
            </div>

            <!-- Current Match -->
            <div
              v-if="spotifySearchArtist?.spotifyId"
              class="p-3 bg-green-50 rounded-lg"
            >
              <div class="text-xs text-green-700 font-medium mb-1">
                Current match
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-green-800">
                  {{ spotifySearchArtist.spotifyName || spotifySearchArtist.spotifyId }}
                </span>
                <a
                  :href="`https://open.spotify.com/artist/${spotifySearchArtist.spotifyId}`"
                  target="_blank"
                  class="text-green-600 hover:text-green-800"
                >
                  <UIcon
                    name="i-heroicons-arrow-top-right-on-square"
                    class="w-4 h-4"
                  />
                </a>
              </div>
            </div>

            <!-- Search Results -->
            <div class="max-h-80 overflow-y-auto space-y-2">
              <div
                v-if="spotifySearchResults.length === 0 && !spotifySearching"
                class="text-center text-gray-500 py-6"
              >
                No results. Try a different search.
              </div>

              <button
                v-for="result in spotifySearchResults"
                :key="result.id"
                :disabled="spotifySaving"
                class="w-full text-left p-3 border rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-3 transition-colors"
                :class="{ 'border-green-500 bg-green-50': spotifySearchArtist?.spotifyId === result.id }"
                @click="selectSpotifyMatch(result.id)"
              >
                <img
                  v-if="result.imageUrl"
                  :src="result.imageUrl"
                  :alt="result.name"
                  class="w-10 h-10 rounded-full object-cover"
                >
                <div
                  v-else
                  class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center"
                >
                  <UIcon
                    name="i-heroicons-user"
                    class="w-5 h-5 text-gray-400"
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-gray-900 text-sm">
                    {{ result.name }}
                  </div>
                  <div class="text-xs text-gray-500 truncate">
                    {{ result.genres.slice(0, 3).join(', ') || 'No genres' }}
                  </div>
                </div>
                <div class="text-xs text-gray-400">
                  {{ result.popularity }}
                </div>
              </button>
            </div>
          </div>

          <template #footer>
            <UButton
              color="neutral"
              variant="outline"
              block
              :loading="spotifySaving"
              @click="clearSpotifyMatch"
            >
              Not on Spotify
            </UButton>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Merge Modal -->
    <UModal
      :open="showMergeModal"
      @close="closeMergeModal"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">
                  Merge Artist
                </h3>
                <p class="text-sm text-gray-500">
                  Merge "{{ mergeSourceArtist?.name }}" into another artist
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="closeMergeModal"
              />
            </div>
          </template>

          <div class="space-y-4">
            <div class="p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
              <strong>{{ mergeSourceArtist?.name }}</strong> will be deleted.
              All {{ mergeSourceArtist?.eventCount || 0 }} event(s) and
              {{ mergeSourceArtist?.favoriteCount || 0 }} favorite(s) will be moved to the target artist.
            </div>

            <!-- Search for target -->
            <div class="flex gap-2">
              <UInput
                v-model="mergeSearchQuery"
                placeholder="Search for target artist..."
                class="flex-1"
                @keyup.enter="searchMergeTargets"
              />
              <UButton
                :loading="mergeSearching"
                @click="searchMergeTargets"
              >
                Search
              </UButton>
            </div>

            <!-- Search Results -->
            <div class="max-h-64 overflow-y-auto space-y-2">
              <div
                v-if="mergeSearchResults.length === 0 && mergeSearchQuery.length >= 2 && !mergeSearching"
                class="text-center text-gray-500 py-4"
              >
                No artists found
              </div>

              <button
                v-for="target in mergeSearchResults"
                :key="target.id"
                :disabled="merging"
                class="w-full text-left p-3 border rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-between gap-3 transition-colors"
                @click="mergeIntoArtist(target)"
              >
                <div class="min-w-0">
                  <div class="font-medium text-gray-900">
                    {{ target.name }}
                  </div>
                  <div class="text-xs text-gray-500">
                    {{ target.eventCount }} events · {{ target.favoriteCount }} favorites
                    <span
                      v-if="target.spotifyName"
                      class="text-green-600"
                    >· Spotify: {{ target.spotifyName }}</span>
                  </div>
                </div>
                <UIcon
                  name="i-heroicons-arrow-right"
                  class="w-5 h-5 text-gray-400 flex-shrink-0"
                />
              </button>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- Duplicates Modal -->
    <UModal
      :open="showDuplicatesModal"
      @close="showDuplicatesModal = false"
    >
      <template #content>
        <UCard class="max-w-2xl">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">
                  Potential Duplicates
                </h3>
                <p class="text-sm text-gray-500">
                  Artists with similar names (80%+ match)
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="showDuplicatesModal = false"
              />
            </div>
          </template>

          <div class="space-y-3 max-h-96 overflow-y-auto">
            <div
              v-if="loadingDuplicates"
              class="flex justify-center py-8"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="w-6 h-6 animate-spin text-gray-400"
              />
            </div>

            <div
              v-else-if="duplicates.length === 0"
              class="text-center text-gray-500 py-8"
            >
              No potential duplicates found
            </div>

            <div
              v-for="pair in duplicates"
              :key="`${pair.artist1.id}-${pair.artist2.id}`"
              class="p-3 border rounded-lg"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-gray-500">
                  {{ Math.round(pair.similarity * 100) }}% similar
                </span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm truncate">
                    {{ pair.artist1.name }}
                  </div>
                  <div class="text-xs text-gray-500">
                    {{ pair.artist1.eventCount }} events
                    <span
                      v-if="pair.artist1.spotifyId"
                      class="text-green-600"
                    >· Spotify</span>
                  </div>
                </div>
                <div class="flex gap-1">
                  <button
                    class="p-1 text-xs bg-primary-100 text-primary-700 rounded hover:bg-primary-200"
                    title="Keep this, merge other into it"
                    @click="quickMerge(pair, true)"
                  >
                    Keep
                  </button>
                </div>
                <UIcon
                  name="i-heroicons-arrows-right-left"
                  class="w-4 h-4 text-gray-400 flex-shrink-0"
                />
                <div class="flex gap-1">
                  <button
                    class="p-1 text-xs bg-primary-100 text-primary-700 rounded hover:bg-primary-200"
                    title="Keep this, merge other into it"
                    @click="quickMerge(pair, false)"
                  >
                    Keep
                  </button>
                </div>
                <div class="flex-1 min-w-0 text-right">
                  <div class="font-medium text-sm truncate">
                    {{ pair.artist2.name }}
                  </div>
                  <div class="text-xs text-gray-500">
                    {{ pair.artist2.eventCount }} events
                    <span
                      v-if="pair.artist2.spotifyId"
                      class="text-green-600"
                    >· Spotify</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- MusicBrainz Search Modal -->
    <UModal
      :open="showMusicBrainzModal"
      @close="closeMusicBrainzModal"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">
                  Match to MusicBrainz
                </h3>
                <p class="text-sm text-gray-500">
                  {{ musicBrainzSearchArtist?.name }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="closeMusicBrainzModal"
              />
            </div>
          </template>

          <div class="space-y-4">
            <!-- Search Input -->
            <div class="flex gap-2">
              <UInput
                v-model="musicBrainzSearchQuery"
                placeholder="Search MusicBrainz..."
                class="flex-1"
                @keyup.enter="searchMusicBrainz"
              />
              <UButton
                :loading="musicBrainzSearching"
                @click="searchMusicBrainz"
              >
                Search
              </UButton>
            </div>

            <!-- Current Match -->
            <div
              v-if="musicBrainzSearchArtist?.musicbrainzId"
              class="p-3 bg-orange-50 rounded-lg"
            >
              <div class="text-xs text-orange-700 font-medium mb-1">
                Current match ({{ Math.round((musicBrainzSearchArtist.musicbrainzMatchConfidence || 0) * 100) }}% confidence)
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-orange-800 truncate">
                  {{ musicBrainzSearchArtist.musicbrainzId }}
                </span>
                <a
                  :href="`https://musicbrainz.org/artist/${musicBrainzSearchArtist.musicbrainzId}`"
                  target="_blank"
                  class="text-orange-600 hover:text-orange-800"
                >
                  <UIcon
                    name="i-heroicons-arrow-top-right-on-square"
                    class="w-4 h-4"
                  />
                </a>
              </div>
              <div
                v-if="musicBrainzSearchArtist.musicbrainzTags?.length"
                class="mt-2 flex flex-wrap gap-1"
              >
                <span
                  v-for="tag in musicBrainzSearchArtist.musicbrainzTags.slice(0, 5)"
                  :key="tag"
                  class="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- Search Results -->
            <div class="max-h-80 overflow-y-auto space-y-2">
              <div
                v-if="musicBrainzSearchResults.length === 0 && !musicBrainzSearching"
                class="text-center text-gray-500 py-6"
              >
                No results. Try a different search.
              </div>

              <button
                v-for="result in musicBrainzSearchResults"
                :key="result.id"
                :disabled="musicBrainzSaving"
                class="w-full text-left p-3 border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                :class="{ 'border-orange-500 bg-orange-50': musicBrainzSearchArtist?.musicbrainzId === result.id }"
                @click="selectMusicBrainzMatch(result.id)"
              >
                <div class="flex items-center justify-between">
                  <div class="font-medium text-gray-900 text-sm">
                    {{ result.name }}
                    <span
                      v-if="result.disambiguation"
                      class="text-gray-500 font-normal"
                    >
                      ({{ result.disambiguation }})
                    </span>
                  </div>
                  <span class="text-xs text-gray-400">
                    {{ result.score }}%
                  </span>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  <span v-if="result.type">{{ result.type }}</span>
                  <span v-if="result.type && result.country"> · </span>
                  <span v-if="result.country">{{ result.country }}</span>
                </div>
                <div
                  v-if="result.tags.length"
                  class="mt-1 flex flex-wrap gap-1"
                >
                  <span
                    v-for="tag in result.tags"
                    :key="tag"
                    class="px-1 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                  >
                    {{ tag }}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <template #footer>
            <UButton
              color="neutral"
              variant="outline"
              block
              :loading="musicBrainzSaving"
              @click="clearMusicBrainzMatch"
            >
              Not on MusicBrainz
            </UButton>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
