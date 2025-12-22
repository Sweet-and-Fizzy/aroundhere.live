<script setup lang="ts">
interface SocialLinks {
  bandcamp?: string
  instagram?: string
  facebook?: string
  twitter?: string
  youtube?: string
  soundcloud?: string
  tiktok?: string
  [key: string]: string | undefined
}

interface Props {
  website?: string | null
  socialLinks?: SocialLinks | null
  spotifyId?: string | null
  musicbrainzId?: string | null
}

const props = defineProps<Props>()

const socialLinkConfig: Record<string, { icon: string; label: string; color: string }> = {
  bandcamp: { icon: 'i-simple-icons-bandcamp', label: 'Bandcamp', color: 'text-[#629aa9]' },
  instagram: { icon: 'i-simple-icons-instagram', label: 'Instagram', color: 'text-[#E4405F]' },
  facebook: { icon: 'i-simple-icons-facebook', label: 'Facebook', color: 'text-[#1877F2]' },
  twitter: { icon: 'i-simple-icons-x', label: 'X / Twitter', color: 'text-gray-900' },
  youtube: { icon: 'i-simple-icons-youtube', label: 'YouTube', color: 'text-[#FF0000]' },
  soundcloud: { icon: 'i-simple-icons-soundcloud', label: 'SoundCloud', color: 'text-[#FF5500]' },
  tiktok: { icon: 'i-simple-icons-tiktok', label: 'TikTok', color: 'text-gray-900' },
}

const parsedSocialLinks = computed(() => {
  if (!props.socialLinks) return []

  return Object.entries(props.socialLinks)
    .filter(([key, value]) => value && socialLinkConfig[key])
    .map(([key, value]) => ({
      key,
      url: value as string,
      ...socialLinkConfig[key],
    }))
})

const hasAnyLinks = computed(() => {
  return props.website || parsedSocialLinks.value.length > 0 || props.spotifyId || props.musicbrainzId
})
</script>

<template>
  <UCard v-if="hasAnyLinks">
    <template #header>
      <h2 class="text-lg font-semibold">
        Links
      </h2>
    </template>

    <div class="space-y-3">
      <!-- Website -->
      <a
        v-if="website"
        :href="website"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 text-gray-700 hover:text-primary-600 transition-colors"
      >
        <UIcon
          name="i-heroicons-globe-alt"
          class="w-5 h-5 flex-shrink-0"
        />
        <span>Official Website</span>
      </a>

      <!-- Spotify Profile -->
      <a
        v-if="spotifyId"
        :href="`https://open.spotify.com/artist/${spotifyId}`"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 text-gray-700 hover:text-[#1DB954] transition-colors"
      >
        <UIcon
          name="i-simple-icons-spotify"
          class="w-5 h-5 flex-shrink-0 text-[#1DB954]"
        />
        <span>Spotify</span>
      </a>

      <!-- Social Links -->
      <a
        v-for="link in parsedSocialLinks"
        :key="link.key"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 text-gray-700 hover:text-primary-600 transition-colors"
      >
        <UIcon
          :name="link.icon"
          :class="['w-5 h-5 flex-shrink-0', link.color]"
        />
        <span>{{ link.label }}</span>
      </a>

      <!-- MusicBrainz -->
      <a
        v-if="musicbrainzId"
        :href="`https://musicbrainz.org/artist/${musicbrainzId}`"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 text-gray-700 hover:text-[#BA478F] transition-colors"
      >
        <UIcon
          name="i-simple-icons-musicbrainz"
          class="w-5 h-5 flex-shrink-0 text-[#BA478F]"
        />
        <span>MusicBrainz</span>
      </a>
    </div>
  </UCard>
</template>
