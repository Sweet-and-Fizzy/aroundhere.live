<script setup lang="ts">
// Get first enabled playlist
const { data: playlistData } = await useFetch('/api/spotify/playlists')

const playlist = computed(() => {
  const playlists = (playlistData.value as any)?.playlists || []
  return playlists.find((p: any) => p.syncEnabled) || playlists[0] || null
})

const embedUrl = computed(() => {
  if (!playlist.value?.playlistId) return ''
  return `https://open.spotify.com/embed/playlist/${playlist.value.playlistId}?utm_source=generator&theme=0`
})

const spotifyUrl = computed(() => {
  if (!playlist.value?.playlistId) return ''
  return `https://open.spotify.com/playlist/${playlist.value.playlistId}`
})

useSeoMeta({
  title: 'Live Music Playlist - AroundHere',
  description: 'A Spotify playlist featuring artists playing live shows in Raleigh, Durham, and the Triangle area. Updated daily with upcoming performances.',
  ogTitle: 'Live Music Playlist - AroundHere',
  ogDescription: 'A Spotify playlist featuring artists playing live shows in Raleigh, Durham, and the Triangle area.',
  ogType: 'website',
})
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <header class="mb-8 text-center">
      <h1 class="text-3xl font-bold text-gray-900 mb-3">
        Live Music Playlist
      </h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">
        Discover artists playing live shows in the Triangle. This playlist is automatically updated daily with tracks from musicians with upcoming performances.
      </p>
    </header>

    <div v-if="playlist">
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
