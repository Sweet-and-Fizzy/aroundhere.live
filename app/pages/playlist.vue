<script setup lang="ts">
interface Region {
  id: string
  name: string
  slug: string
}

interface Playlist {
  id: string
  playlistId: string
  name: string
  regionId: string | null
  region: Region | null
  syncEnabled: boolean
  lastSyncedAt: string | null
  trackCount: number
}

// Get all playlists
const { data: playlistData } = await useFetch('/api/spotify/playlists')

const allPlaylists = computed(() => {
  return ((playlistData.value as any)?.playlists || []) as Playlist[]
})

// Get enabled playlists only
const enabledPlaylists = computed(() => {
  return allPlaylists.value.filter(p => p.syncEnabled)
})

// Get user's current region from composable
const { region: currentRegion, loaded: regionLoaded } = useCurrentRegion()

// Selected region (null = All Regions/Global)
const selectedRegionId = ref<string | null>(null)

// Initialize selection based on user's region
onMounted(() => {
  // Check localStorage first for previous selection
  const savedSelection = localStorage.getItem('playlistRegion')
  if (savedSelection !== null) {
    // Empty string means "all regions", otherwise it's a region ID
    selectedRegionId.value = savedSelection === '' ? null : savedSelection
  } else if (currentRegion.value?.id) {
    // Default to user's current region if they have one
    selectedRegionId.value = currentRegion.value.id
  }
})

// Also watch for when region loads (may happen after mount)
watch([regionLoaded, currentRegion], ([loaded, region]) => {
  // Only set if no previous selection was saved and we haven't already set it
  if (loaded && region?.id && localStorage.getItem('playlistRegion') === null) {
    selectedRegionId.value = region.id
  }
}, { immediate: true })

// Save selection to localStorage when it changes
watch(selectedRegionId, (newVal) => {
  localStorage.setItem('playlistRegion', newVal ?? '')
})

// Current playlist based on selection
const playlist = computed(() => {
  if (enabledPlaylists.value.length === 0) return null

  // If a specific region is selected, find matching playlist
  if (selectedRegionId.value) {
    const regionPlaylist = enabledPlaylists.value.find(p => p.regionId === selectedRegionId.value)
    if (regionPlaylist) return regionPlaylist
  }

  // Fall back to global playlist (regionId: null) or first available
  const globalPlaylist = enabledPlaylists.value.find(p => p.regionId === null)
  return globalPlaylist || enabledPlaylists.value[0]
})

// Available regions for the dropdown (from playlists that have regions)
const availableRegions = computed(() => {
  const regions: Region[] = []
  const seen = new Set<string>()

  for (const p of enabledPlaylists.value) {
    if (p.region && !seen.has(p.region.id)) {
      seen.add(p.region.id)
      regions.push(p.region)
    }
  }

  return regions.sort((a, b) => a.name.localeCompare(b.name))
})

// Check if we have a global playlist
const hasGlobalPlaylist = computed(() => {
  return enabledPlaylists.value.some(p => p.regionId === null)
})

// Show region selector only if there are multiple options
const showRegionSelector = computed(() => {
  const options = availableRegions.value.length + (hasGlobalPlaylist.value ? 1 : 0)
  return options > 1
})

const embedUrl = computed(() => {
  if (!playlist.value?.playlistId) return ''
  return `https://open.spotify.com/embed/playlist/${playlist.value.playlistId}?utm_source=generator&theme=0`
})

const spotifyUrl = computed(() => {
  if (!playlist.value?.playlistId) return ''
  return `https://open.spotify.com/playlist/${playlist.value.playlistId}`
})

const config = useRuntimeConfig()
const canonicalUrl = `${config.public.siteUrl}/playlist`

useSeoMeta({
  title: 'Live Music Playlist - AroundHere',
  description: 'A Spotify playlist featuring artists playing live shows nearby. Updated daily with upcoming performances.',
  // Open Graph
  ogTitle: 'Live Music Playlist - AroundHere',
  ogDescription: 'A Spotify playlist featuring artists playing live shows nearby. Updated daily with upcoming performances.',
  ogUrl: canonicalUrl,
  ogType: 'music.playlist',
  ogImage: `${config.public.siteUrl}/og-image-playlist.png`,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  // Twitter
  twitterCard: 'summary_large_image',
  twitterTitle: 'Live Music Playlist - AroundHere',
  twitterDescription: 'Discover artists playing live shows nearby with our daily-updated Spotify playlist.',
  twitterImage: `${config.public.siteUrl}/og-image-playlist.png`,
})

useHead({
  link: [
    { rel: 'canonical', href: canonicalUrl },
  ],
})
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <header class="mb-8 text-center">
      <h1 class="text-3xl font-bold text-gray-900 mb-3">
        Live Music Playlist
      </h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">
        Discover artists playing live shows nearby. This playlist is automatically updated daily with tracks from musicians with upcoming performances.
      </p>
    </header>

    <div v-if="playlist">
      <!-- Region Selector -->
      <div
        v-if="showRegionSelector"
        class="mb-4 flex justify-center"
      >
        <select
          v-model="selectedRegionId"
          class="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option
            v-if="hasGlobalPlaylist"
            :value="null"
          >
            All Regions
          </option>
          <option
            v-for="region in availableRegions"
            :key="region.id"
            :value="region.id"
          >
            {{ region.name }}
          </option>
        </select>
      </div>

      <!-- Spotify Embed -->
      <div class="bg-gray-900 rounded-xl overflow-hidden shadow-xl">
        <iframe
          v-if="embedUrl"
          :src="embedUrl"
          width="100%"
          height="500"
          frameborder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          class="w-full"
        />
      </div>

      <!-- Open in Spotify Link -->
      <div class="mt-4 text-center">
        <a
          :href="spotifyUrl"
          target="_blank"
          class="inline-flex items-center gap-2 text-[#1DB954] hover:text-[#1ed760] font-medium"
        >
          <SpotifyIcon class="w-6 h-6" />
          Open in Spotify
        </a>
      </div>

      <!-- Info -->
      <div class="mt-8 bg-gray-50 rounded-lg p-6">
        <h2 class="font-semibold text-gray-900 mb-2">
          How it works
        </h2>
        <ul class="text-gray-600 space-y-2">
          <li class="flex items-start gap-2">
            <UIcon
              name="i-heroicons-musical-note"
              class="w-5 h-5 text-primary-500 mt-0.5"
            />
            <span>We match artists from upcoming local shows to their Spotify profiles</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon
              name="i-heroicons-arrow-path"
              class="w-5 h-5 text-primary-500 mt-0.5"
            />
            <span>The playlist updates daily with 2-4 tracks per artist based on how soon they're playing</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon
              name="i-heroicons-calendar"
              class="w-5 h-5 text-primary-500 mt-0.5"
            />
            <span>Shows happening sooner appear first so you can preview what's coming up</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon
              name="i-heroicons-trash"
              class="w-5 h-5 text-primary-500 mt-0.5"
            />
            <span>After a show passes, those tracks are removed to keep things fresh</span>
          </li>
        </ul>
      </div>

      <!-- Last sync info -->
      <div
        v-if="playlist.lastSyncedAt"
        class="mt-4 text-center text-sm text-gray-500"
      >
        Last updated: {{ new Date(playlist.lastSyncedAt).toLocaleString() }}
        <span v-if="playlist.region">
          · {{ playlist.region.name }}
        </span>
        <span v-else-if="!selectedRegionId">
          · All Regions
        </span>
      </div>
    </div>

    <!-- No playlist configured -->
    <div
      v-else
      class="text-center py-12"
    >
      <UIcon
        name="i-heroicons-musical-note"
        class="w-16 h-16 text-gray-300 mx-auto mb-4"
      />
      <p class="text-gray-500">
        No playlist configured yet. Check back soon!
      </p>
    </div>
  </div>
</template>
