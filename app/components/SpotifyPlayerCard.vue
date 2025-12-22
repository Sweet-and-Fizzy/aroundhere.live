<script setup lang="ts">
interface Props {
  spotifyId: string | null | undefined
  artistName: string
}

const props = defineProps<Props>()

const embedUrl = computed(() => {
  if (!props.spotifyId) return null
  return `https://open.spotify.com/embed/artist/${props.spotifyId}?utm_source=generator&theme=0`
})

const iframeLoaded = ref(false)
</script>

<template>
  <UCard v-if="spotifyId">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon
          name="i-simple-icons-spotify"
          class="w-5 h-5 text-[#1DB954]"
        />
        <h2 class="text-lg font-semibold">
          Listen on Spotify
        </h2>
      </div>
    </template>

    <div class="aspect-[3/4] sm:aspect-[4/5] md:aspect-[3/4] w-full relative">
      <!-- Loading skeleton -->
      <div
        v-if="!iframeLoaded"
        class="absolute inset-0 bg-gray-900 rounded-lg flex flex-col items-center justify-center gap-4"
      >
        <UIcon
          name="i-simple-icons-spotify"
          class="w-12 h-12 text-[#1DB954] animate-pulse"
        />
        <USkeleton class="h-4 w-32" />
        <div class="space-y-2 w-3/4">
          <USkeleton class="h-10 w-full rounded" />
          <USkeleton class="h-10 w-full rounded" />
          <USkeleton class="h-10 w-full rounded" />
        </div>
      </div>
      <iframe
        :title="`${artistName} on Spotify`"
        :src="embedUrl!"
        width="100%"
        height="100%"
        frameborder="0"
        allowfullscreen
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        class="rounded-lg"
        :class="{ 'opacity-0': !iframeLoaded }"
        @load="iframeLoaded = true"
      />
    </div>
  </UCard>
</template>
