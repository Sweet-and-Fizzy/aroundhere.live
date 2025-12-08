<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

interface Artist {
  id: string
  name: string
  slug: string
  spotifyId: string | null
  spotifyName: string | null
  spotifyMatchConfidence: number | null
  spotifyMatchStatus: 'PENDING' | 'AUTO_MATCHED' | 'NEEDS_REVIEW' | 'VERIFIED' | 'NO_MATCH'
  spotifyPopularTracks: any[] | null
  eventCount: number
}

interface SpotifySearchResult {
  id: string
  name: string
  popularity: number
  genres: string[]
  imageUrl: string | null
  spotifyUrl: string
}

interface Playlist {
  id: string
  playlistId: string
  name: string
  description: string | null
  daysAhead: number
  syncEnabled: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
  trackCount: number
}

// Tabs
const activeTab = ref<'review' | 'all' | 'matched'>('review')

// Stats
const { data: stats, refresh: refreshStats } = await useFetch('/api/spotify/artists/stats')

// Artists list
const statusFilter = computed(() => {
  switch (activeTab.value) {
    case 'review': return 'NEEDS_REVIEW'
    case 'matched': return 'AUTO_MATCHED'
    default: return undefined
  }
})

const { data: artistsData, refresh: refreshArtists } = await useFetch('/api/spotify/artists', {
  query: computed(() => ({
    status: statusFilter.value,
    limit: 50,
  })),
})

const artists = computed(() => artistsData.value?.artists || [])

// Search modal state
const showSearchModal = ref(false)
const searchingArtist = ref<Artist | null>(null)
const searchQuery = ref('')
const searchResults = ref<SpotifySearchResult[]>([])
const searching = ref(false)

// Actions
const saving = ref<string | null>(null)

async function openSearchModal(artist: Artist) {
  searchingArtist.value = artist
  searchQuery.value = artist.name
  searchResults.value = []
  showSearchModal.value = true
  await searchSpotify()
}

async function searchSpotify() {
  if (!searchQuery.value.trim()) return

  searching.value = true
  try {
    const result = await $fetch('/api/spotify/search', {
      query: { q: searchQuery.value, limit: 10 },
    })
    searchResults.value = (result as any).artists || []
  } catch (error) {
    console.error('Search failed:', error)
  } finally {
    searching.value = false
  }
}

async function selectSpotifyMatch(spotifyId: string) {
  if (!searchingArtist.value) return

  saving.value = searchingArtist.value.id
  try {
    await $fetch(`/api/spotify/artists/${searchingArtist.value.id}`, {
      method: 'PATCH',
      body: { spotifyId },
    })
    showSearchModal.value = false
    searchingArtist.value = null
    refreshArtists()
    refreshStats()
  } catch (error: any) {
    alert(error.data?.message || 'Failed to update artist')
  } finally {
    saving.value = null
  }
}

async function markNoMatch(artistId: string) {
  saving.value = artistId
  try {
    await $fetch(`/api/spotify/artists/${artistId}`, {
      method: 'PATCH',
      body: { status: 'NO_MATCH' },
    })
    refreshArtists()
    refreshStats()
  } catch (error: any) {
    alert(error.data?.message || 'Failed to update artist')
  } finally {
    saving.value = null
  }
}

async function verifyMatch(artistId: string) {
  saving.value = artistId
  try {
    const artist = artists.value.find((a: Artist) => a.id === artistId)
    if (!artist?.spotifyId) return

    await $fetch(`/api/spotify/artists/${artistId}`, {
      method: 'PATCH',
      body: { spotifyId: artist.spotifyId },
    })
    refreshArtists()
    refreshStats()
  } catch (error: any) {
    alert(error.data?.message || 'Failed to verify artist')
  } finally {
    saving.value = null
  }
}

async function resetToPending(artistId: string) {
  saving.value = artistId
  try {
    await $fetch(`/api/spotify/artists/${artistId}`, {
      method: 'PATCH',
      body: { status: 'PENDING' },
    })
    refreshArtists()
    refreshStats()
  } catch (error: any) {
    alert(error.data?.message || 'Failed to reset artist')
  } finally {
    saving.value = null
  }
}

// Run matcher
const matching = ref(false)
const matchResult = ref<any>(null)

// Playlists
const { data: playlistsData, refresh: refreshPlaylists } = await useFetch('/api/spotify/playlists')
const playlists = computed(() => (playlistsData.value as any)?.playlists || [])

const showAddPlaylist = ref(false)
const newPlaylistId = ref('')
const newPlaylistName = ref('')
const syncing = ref<string | null>(null)

async function addPlaylist() {
  if (!newPlaylistId.value.trim() || !newPlaylistName.value.trim()) return

  try {
    await $fetch('/api/spotify/playlists', {
      method: 'POST',
      body: {
        playlistId: newPlaylistId.value.trim(),
        name: newPlaylistName.value.trim(),
      },
    })
    showAddPlaylist.value = false
    newPlaylistId.value = ''
    newPlaylistName.value = ''
    refreshPlaylists()
  } catch (error: any) {
    alert(error.data?.message || 'Failed to add playlist')
  }
}

async function syncPlaylist(playlistId: string) {
  syncing.value = playlistId
  try {
    const result = await $fetch('/api/spotify/playlists/sync', {
      method: 'POST',
      body: { playlistId },
    })
    refreshPlaylists()
    const syncResult = (result as any).results?.[0]
    if (syncResult) {
      alert(`Synced! Added ${syncResult.tracksAdded}, removed ${syncResult.tracksRemoved}. Total: ${syncResult.totalTracks} tracks.`)
    }
  } catch (error: any) {
    alert(error.data?.message || 'Sync failed')
  } finally {
    syncing.value = null
  }
}

async function togglePlaylistSync(playlist: Playlist) {
  try {
    await $fetch(`/api/spotify/playlists/${playlist.playlistId}`, {
      method: 'PATCH',
      body: { syncEnabled: !playlist.syncEnabled },
    })
    refreshPlaylists()
  } catch (error: any) {
    alert(error.data?.message || 'Failed to update playlist')
  }
}

async function removePlaylist(playlistId: string) {
  if (!confirm('Remove this playlist from sync? (The Spotify playlist itself will not be deleted.)')) return

  try {
    await $fetch(`/api/spotify/playlists/${playlistId}`, {
      method: 'DELETE',
    })
    refreshPlaylists()
  } catch (error: any) {
    alert(error.data?.message || 'Failed to remove playlist')
  }
}

async function runMatcher(limit = 20) {
  matching.value = true
  matchResult.value = null
  try {
    const result = await $fetch('/api/spotify/artists/match', {
      method: 'POST',
      body: { limit },
    })
    matchResult.value = result
    refreshArtists()
    refreshStats()
  } catch (error: any) {
    alert(error.data?.message || 'Matching failed')
  } finally {
    matching.value = false
  }
}

function confidenceColor(confidence: number | null): string {
  if (!confidence) return 'text-gray-400'
  if (confidence >= 0.9) return 'text-green-600'
  if (confidence >= 0.7) return 'text-yellow-600'
  return 'text-red-600'
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'VERIFIED': return 'bg-green-100 text-green-700'
    case 'AUTO_MATCHED': return 'bg-blue-100 text-blue-700'
    case 'NEEDS_REVIEW': return 'bg-yellow-100 text-yellow-700'
    case 'NO_MATCH': return 'bg-gray-100 text-gray-700'
    case 'PENDING': return 'bg-purple-100 text-purple-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

useSeoMeta({
  title: 'Admin - Spotify Integration',
  description: 'Manage Spotify artist matching',
})
</script>

<template>
  <div class="px-4 py-8 max-w-6xl mx-auto">
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-3xl font-bold">
          Spotify Integration
        </h1>
        <p class="text-gray-600 mt-1">
          Match artists to Spotify for playlist automation
        </p>
      </div>

      <!-- Run Matcher Button -->
      <button
        :disabled="matching"
        class="bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
        @click="runMatcher(20)"
      >
        <span
          v-if="matching"
          class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"
        />
        {{ matching ? 'Matching...' : 'Run Matcher (20)' }}
      </button>
    </div>

    <!-- Stats Cards -->
    <div
      v-if="stats"
      class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6"
    >
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-2xl font-bold text-purple-600">
          {{ stats.pending }}
        </div>
        <div class="text-sm text-gray-600">
          Pending
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-2xl font-bold text-yellow-600">
          {{ stats.needsReview }}
        </div>
        <div class="text-sm text-gray-600">
          Needs Review
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-2xl font-bold text-blue-600">
          {{ stats.autoMatched }}
        </div>
        <div class="text-sm text-gray-600">
          Auto-Matched
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-2xl font-bold text-green-600">
          {{ stats.verified }}
        </div>
        <div class="text-sm text-gray-600">
          Verified
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-2xl font-bold text-gray-600">
          {{ stats.noMatch }}
        </div>
        <div class="text-sm text-gray-600">
          No Match
        </div>
      </div>
    </div>

    <!-- Match Result -->
    <div
      v-if="matchResult"
      class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6"
    >
      <div class="flex justify-between items-start">
        <div>
          <div class="font-medium text-blue-900">
            Matcher completed
          </div>
          <div class="text-sm text-blue-700 mt-1">
            Processed {{ matchResult.job.processed }} artists:
            {{ matchResult.job.autoMatched }} auto-matched,
            {{ matchResult.job.needsReview }} need review,
            {{ matchResult.job.noMatch }} no match
          </div>
        </div>
        <button
          class="text-blue-600 hover:text-blue-800"
          @click="matchResult = null"
        >
          ×
        </button>
      </div>
    </div>

    <!-- Playlists Section -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold">
          Playlist Sync
        </h2>
        <button
          class="text-sm text-primary-600 hover:text-primary-700"
          @click="showAddPlaylist = !showAddPlaylist"
        >
          {{ showAddPlaylist ? 'Cancel' : '+ Add Playlist' }}
        </button>
      </div>

      <!-- Add Playlist Form -->
      <div
        v-if="showAddPlaylist"
        class="mb-4 p-4 bg-gray-50 rounded-lg"
      >
        <div class="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Spotify Playlist ID</label>
            <input
              v-model="newPlaylistId"
              type="text"
              placeholder="e.g. 37i9dQZF1DXcBWIGoYBM5M"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
            <p class="text-xs text-gray-500 mt-1">
              Find in playlist URL after /playlist/
            </p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              v-model="newPlaylistName"
              type="text"
              placeholder="e.g. Raleigh Live Music"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
          </div>
        </div>
        <button
          :disabled="!newPlaylistId.trim() || !newPlaylistName.trim()"
          class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:bg-gray-400"
          @click="addPlaylist"
        >
          Add Playlist
        </button>
      </div>

      <!-- Playlists List -->
      <div
        v-if="playlists.length === 0 && !showAddPlaylist"
        class="text-center text-gray-500 py-4"
      >
        No playlists configured yet. Add one to start syncing!
      </div>

      <div
        v-else
        class="space-y-3"
      >
        <div
          v-for="playlist in playlists"
          :key="playlist.id"
          class="flex items-center justify-between p-3 border rounded-lg"
          :class="playlist.syncEnabled ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-60'"
        >
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ playlist.name }}</span>
              <a
                :href="`https://open.spotify.com/playlist/${playlist.playlistId}`"
                target="_blank"
                class="text-green-600 hover:text-green-700"
                title="Open in Spotify"
              >
                <UIcon
                  name="i-heroicons-arrow-top-right-on-square"
                  class="w-4 h-4"
                />
              </a>
              <span
                v-if="!playlist.syncEnabled"
                class="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded"
              >
                Paused
              </span>
            </div>
            <div class="text-sm text-gray-500">
              {{ playlist.trackCount }} tracks
              <span v-if="playlist.lastSyncedAt">
                · Last sync: {{ new Date(playlist.lastSyncedAt).toLocaleString() }}
              </span>
              <span
                v-if="playlist.lastSyncError"
                class="text-red-500"
              >
                · Error: {{ playlist.lastSyncError }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              :disabled="syncing === playlist.playlistId"
              class="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 px-3 py-1"
              @click="syncPlaylist(playlist.playlistId)"
            >
              {{ syncing === playlist.playlistId ? 'Syncing...' : 'Sync Now' }}
            </button>
            <button
              class="text-sm text-gray-600 hover:text-gray-700 px-3 py-1"
              @click="togglePlaylistSync(playlist)"
            >
              {{ playlist.syncEnabled ? 'Pause' : 'Resume' }}
            </button>
            <button
              class="text-sm text-red-600 hover:text-red-700 px-2 py-1"
              title="Remove from sync"
              @click="removePlaylist(playlist.playlistId)"
            >
              <UIcon
                name="i-heroicons-trash"
                class="w-4 h-4"
              />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 mb-6">
      <nav class="flex gap-6">
        <button
          :class="activeTab === 'review'
            ? 'border-b-2 border-primary-600 text-primary-600'
            : 'text-gray-500 hover:text-gray-700'"
          class="pb-3 font-medium"
          @click="activeTab = 'review'"
        >
          Needs Review ({{ stats?.needsReview || 0 }})
        </button>
        <button
          :class="activeTab === 'matched'
            ? 'border-b-2 border-primary-600 text-primary-600'
            : 'text-gray-500 hover:text-gray-700'"
          class="pb-3 font-medium"
          @click="activeTab = 'matched'"
        >
          Auto-Matched ({{ stats?.autoMatched || 0 }})
        </button>
        <button
          :class="activeTab === 'all'
            ? 'border-b-2 border-primary-600 text-primary-600'
            : 'text-gray-500 hover:text-gray-700'"
          class="pb-3 font-medium"
          @click="activeTab = 'all'"
        >
          All Artists ({{ stats?.total || 0 }})
        </button>
      </nav>
    </div>

    <!-- Artists Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden max-h-[70vh] overflow-y-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Artist
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Spotify Match
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Confidence
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
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
              <div class="text-sm text-gray-500">
                {{ artist.eventCount }} event{{ artist.eventCount === 1 ? '' : 's' }}
              </div>
            </td>
            <td class="px-6 py-4">
              <div
                v-if="artist.spotifyName"
                class="flex items-center gap-2"
              >
                <span>{{ artist.spotifyName }}</span>
                <a
                  v-if="artist.spotifyId"
                  :href="`https://open.spotify.com/artist/${artist.spotifyId}`"
                  target="_blank"
                  class="text-green-600 hover:text-green-700"
                  title="Open in Spotify"
                >
                  <UIcon
                    name="i-heroicons-arrow-top-right-on-square"
                    class="w-4 h-4"
                  />
                </a>
              </div>
              <span
                v-else
                class="text-gray-400"
              >—</span>
            </td>
            <td class="px-6 py-4">
              <span
                v-if="artist.spotifyMatchConfidence"
                :class="confidenceColor(artist.spotifyMatchConfidence)"
                class="font-medium"
              >
                {{ Math.round(artist.spotifyMatchConfidence * 100) }}%
              </span>
              <span
                v-else
                class="text-gray-400"
              >—</span>
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded"
                :class="statusBadgeClass(artist.spotifyMatchStatus)"
              >
                {{ artist.spotifyMatchStatus.replace('_', ' ') }}
              </span>
            </td>
            <td class="px-6 py-4 text-right">
              <div class="flex justify-end gap-2">
                <!-- For NEEDS_REVIEW: Verify or Reject -->
                <template v-if="artist.spotifyMatchStatus === 'NEEDS_REVIEW'">
                  <button
                    :disabled="saving === artist.id"
                    class="text-sm text-green-600 hover:text-green-700 disabled:opacity-50"
                    @click="verifyMatch(artist.id)"
                  >
                    Verify
                  </button>
                  <button
                    :disabled="saving === artist.id"
                    class="text-sm text-gray-600 hover:text-gray-700 disabled:opacity-50"
                    @click="openSearchModal(artist)"
                  >
                    Search
                  </button>
                  <button
                    :disabled="saving === artist.id"
                    class="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                    @click="markNoMatch(artist.id)"
                  >
                    No Match
                  </button>
                </template>

                <!-- For AUTO_MATCHED: Verify or Change -->
                <template v-else-if="artist.spotifyMatchStatus === 'AUTO_MATCHED'">
                  <button
                    :disabled="saving === artist.id"
                    class="text-sm text-green-600 hover:text-green-700 disabled:opacity-50"
                    @click="verifyMatch(artist.id)"
                  >
                    Verify
                  </button>
                  <button
                    :disabled="saving === artist.id"
                    class="text-sm text-gray-600 hover:text-gray-700 disabled:opacity-50"
                    @click="openSearchModal(artist)"
                  >
                    Change
                  </button>
                </template>

                <!-- For others: Search or Reset -->
                <template v-else>
                  <button
                    :disabled="saving === artist.id"
                    class="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
                    @click="openSearchModal(artist)"
                  >
                    Search
                  </button>
                  <button
                    v-if="artist.spotifyMatchStatus !== 'PENDING'"
                    :disabled="saving === artist.id"
                    class="text-sm text-gray-600 hover:text-gray-700 disabled:opacity-50"
                    @click="resetToPending(artist.id)"
                  >
                    Reset
                  </button>
                </template>
              </div>
            </td>
          </tr>
          <tr v-if="artists.length === 0">
            <td
              colspan="5"
              class="px-6 py-8 text-center text-gray-500"
            >
              No artists found.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Search Modal -->
    <UModal
      v-model:open="showSearchModal"
      :ui="{ width: 'max-w-2xl' }"
    >
      <template #header>
        <div>
          <h2 class="text-xl font-bold">
            Search Spotify
          </h2>
          <p class="text-sm text-gray-600">
            Finding match for: {{ searchingArtist?.name }}
          </p>
        </div>
      </template>

      <template #body>
        <!-- Search Input -->
        <div class="flex gap-2 mb-4">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search Spotify..."
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            @keyup.enter="searchSpotify"
          >
          <button
            :disabled="searching"
            class="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:bg-gray-400"
            @click="searchSpotify"
          >
            {{ searching ? 'Searching...' : 'Search' }}
          </button>
        </div>

        <!-- Results (scrollable) -->
        <div class="max-h-96 overflow-y-auto">
          <div
            v-if="searchResults.length === 0 && !searching"
            class="text-center text-gray-500 py-8"
          >
            No results. Try a different search.
          </div>

          <div class="space-y-2">
            <button
              v-for="result in searchResults"
              :key="result.id"
              :disabled="saving === searchingArtist?.id"
              class="w-full text-left p-4 border rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-4"
              @click="selectSpotifyMatch(result.id)"
            >
              <img
                v-if="result.imageUrl"
                :src="result.imageUrl"
                :alt="result.name"
                class="w-12 h-12 rounded-full object-cover"
              >
              <div
                v-else
                class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center"
              >
                <UIcon
                  name="i-heroicons-user"
                  class="w-6 h-6 text-gray-400"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900">
                  {{ result.name }}
                </div>
                <div class="text-sm text-gray-500 truncate">
                  {{ result.genres.slice(0, 3).join(', ') || 'No genres' }}
                </div>
              </div>
              <div class="text-sm text-gray-400">
                Pop: {{ result.popularity }}
              </div>
            </button>
          </div>
        </div>
      </template>

      <template #footer>
        <UButton
          :disabled="saving === searchingArtist?.id"
          color="neutral"
          variant="outline"
          block
          @click="searchingArtist && markNoMatch(searchingArtist.id); showSearchModal = false"
        >
          Artist not on Spotify - Mark as No Match
        </UButton>
      </template>
    </UModal>
  </div>
</template>
