<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

const route = useRoute()
const slug = route.params.slug as string

interface Artist {
  id: string
  name: string
  slug: string
  genres: string[]
  description?: string | null
  website?: string | null
  socialLinks?: Record<string, string> | null
  isLocal: boolean
  spotifyId?: string | null
  spotifyName?: string | null
  spotifyGenres?: string[]
  spotifyPopularTracks?: Array<{
    trackId: string
    name: string
    uri: string
    durationMs: number
  }> | null
  musicbrainzId?: string | null
  musicbrainzDescription?: string | null
  musicbrainzTags?: string[]
  artistReviews?: Array<{
    review: {
      id: string
      title: string
      url: string
      excerpt?: string | null
      publishedAt?: string | null
      source: {
        name: string
        slug: string
      }
    }
  }>
}

interface ArtistResponse {
  artist: Artist
  upcomingEvents: Event[]
  pastEventsCount: number
}

const { data, error } = await useFetch<ArtistResponse>(`/api/artists/by-slug/${slug}`)

if (error.value) {
  throw createError({
    statusCode: 404,
    message: 'Artist not found',
  })
}

const artist = computed(() => data.value?.artist)
const upcomingEvents = computed(() => data.value?.upcomingEvents ?? [])
const pastEventsCount = computed(() => data.value?.pastEventsCount ?? 0)

// View mode toggle - persist in localStorage
const viewMode = ref<'card' | 'compact'>('card')
onMounted(() => {
  const saved = localStorage.getItem('artistEventViewMode')
  if (saved === 'compact' || saved === 'card') {
    viewMode.value = saved
  }
})
watch(viewMode, (newMode) => {
  localStorage.setItem('artistEventViewMode', newMode)
})

const config = useRuntimeConfig()

// Combine genres from all sources
const allGenres = computed(() => {
  if (!artist.value) return []
  const genres = new Set<string>()

  // Add main genres
  artist.value.genres?.forEach((g) => genres.add(g))

  // Add Spotify genres
  artist.value.spotifyGenres?.forEach((g) => genres.add(g))

  // Add MusicBrainz tags (limit these as they can be many)
  artist.value.musicbrainzTags?.slice(0, 5).forEach((t) => genres.add(t))

  return Array.from(genres).slice(0, 8)
})

// Use MusicBrainz description if available, otherwise our description
const displayDescription = computed(() => {
  return artist.value?.musicbrainzDescription || artist.value?.description
})

const seoDescription = computed(() => {
  if (!artist.value) return ''
  const desc = displayDescription.value?.slice(0, 160)
  if (desc) return desc
  const genreText = allGenres.value.length > 0 ? `${allGenres.value.slice(0, 3).join(', ')} ` : ''
  return `${artist.value.name} - ${genreText}artist. See upcoming shows, listen to tracks, and more.`
})

const canonicalUrl = computed(() => {
  return `${config.public.siteUrl}/artists/${artist.value?.slug}`
})

useSeoMeta({
  title: () => `${artist.value?.name} - Artist`,
  description: () => seoDescription.value,
  ogTitle: () => `${artist.value?.name} - Artist`,
  ogDescription: () => seoDescription.value,
  ogUrl: () => canonicalUrl.value,
  ogType: 'profile',
  twitterCard: 'summary',
  twitterTitle: () => `${artist.value?.name} - Artist`,
  twitterDescription: () => seoDescription.value,
})

useHead({
  link: [
    { rel: 'canonical', href: canonicalUrl },
  ],
})

// JSON-LD structured data for artist
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: computed(() => {
        if (!artist.value) return '{}'
        const a = artist.value
        const jsonLd: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@type': 'MusicGroup',
          name: a.name,
          url: canonicalUrl.value,
          description: displayDescription.value || undefined,
          genre: allGenres.value.length > 0 ? allGenres.value : undefined,
        }
        const sameAs: string[] = []
        if (a.website) sameAs.push(a.website)
        if (a.spotifyId) sameAs.push(`https://open.spotify.com/artist/${a.spotifyId}`)
        if (a.musicbrainzId) sameAs.push(`https://musicbrainz.org/artist/${a.musicbrainzId}`)
        if (a.socialLinks) {
          Object.values(a.socialLinks).forEach((url) => {
            if (url) sameAs.push(url)
          })
        }
        if (sameAs.length > 0) {
          jsonLd.sameAs = sameAs
        }
        return JSON.stringify(jsonLd)
      }),
    },
  ],
})
</script>

<template>
  <div v-if="artist">
    <!-- Header -->
    <div
      class="relative text-white py-12 -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 px-4 sm:px-6 lg:px-8 mb-8 min-h-[200px] sm:min-h-[240px] flex items-end bg-gradient-to-br from-gray-800 to-gray-900"
    >
      <div class="relative max-w-4xl mx-auto w-full">
        <div class="flex items-center justify-between mb-4">
          <BackButton variant="light" />
        </div>
        <div class="flex items-center gap-3 mt-2">
          <h1 class="text-3xl md:text-4xl font-bold drop-shadow-lg">
            {{ artist.name }}
          </h1>
          <FavoriteButton
            :id="artist.id"
            type="artist"
            :name="artist.name"
            :slug="artist.slug"
            size="lg"
          />
        </div>

        <!-- Badges -->
        <div class="flex flex-wrap items-center gap-2 mt-3">
          <UBadge
            v-if="artist.isLocal"
            color="primary"
            variant="solid"
            size="sm"
          >
            Local Artist
          </UBadge>
          <UBadge
            v-for="genre in allGenres.slice(0, 5)"
            :key="genre"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            {{ genre }}
          </UBadge>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-4xl mx-auto">
      <!-- Two-column layout when we have description -->
      <div
        v-if="displayDescription"
        class="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <!-- Left Column: About, Spotify, Reviews -->
        <div class="md:col-span-2 space-y-6">
          <!-- About Card -->
          <UCard>
            <template #header>
              <h2 class="text-lg font-semibold">
                About
              </h2>
            </template>
            <div class="text-gray-700 space-y-3">
              <p
                v-for="(paragraph, idx) in displayDescription.split('\n').filter(p => p.trim())"
                :key="idx"
              >
                {{ paragraph }}
              </p>
            </div>
          </UCard>

          <!-- Spotify Player (under About) -->
          <SpotifyPlayerCard
            :spotify-id="artist.spotifyId"
            :artist-name="artist.name"
          />

          <!-- Reviews Card -->
          <UCard v-if="artist.artistReviews && artist.artistReviews.length > 0">
            <template #header>
              <h2 class="text-lg font-semibold">
                Featured In
              </h2>
            </template>
            <div class="space-y-3">
              <a
                v-for="ar in artist.artistReviews"
                :key="ar.review.id"
                :href="ar.review.url"
                target="_blank"
                rel="noopener noreferrer"
                class="block p-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div class="flex items-start gap-3">
                  <UIcon
                    name="i-heroicons-newspaper"
                    class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5"
                  />
                  <div>
                    <p class="font-medium text-gray-900 line-clamp-2">
                      {{ ar.review.title }}
                    </p>
                    <p class="text-sm text-gray-500 mt-1">
                      {{ ar.review.source.name }}
                      <span v-if="ar.review.publishedAt">
                        &middot;
                        {{ new Date(ar.review.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                      </span>
                    </p>
                  </div>
                </div>
              </a>
            </div>
          </UCard>

          <!-- Links Card (shows on mobile only) -->
          <div class="md:hidden">
            <ArtistLinksCard
              :website="artist.website"
              :social-links="artist.socialLinks"
              :spotify-id="artist.spotifyId"
              :musicbrainz-id="artist.musicbrainzId"
            />
          </div>
        </div>

        <!-- Right Column: Links only -->
        <div class="hidden md:block">
          <ArtistLinksCard
            :website="artist.website"
            :social-links="artist.socialLinks"
            :spotify-id="artist.spotifyId"
            :musicbrainz-id="artist.musicbrainzId"
          />
        </div>
      </div>

      <!-- Single row layout when no description (Spotify + Links side by side) -->
      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 gap-6"
      >
        <SpotifyPlayerCard
          :spotify-id="artist.spotifyId"
          :artist-name="artist.name"
        />
        <ArtistLinksCard
          :website="artist.website"
          :social-links="artist.socialLinks"
          :spotify-id="artist.spotifyId"
          :musicbrainz-id="artist.musicbrainzId"
        />
      </div>

      <!-- Events Section -->
      <div class="mt-8">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold text-gray-900">
            Upcoming Events ({{ upcomingEvents.length }})
          </h2>

          <!-- View Toggle Buttons -->
          <div
            v-if="upcomingEvents.length > 0"
            class="flex gap-1 bg-gray-100 rounded-lg p-1"
          >
            <button
              :class="[
                'p-1.5 rounded transition-colors',
                viewMode === 'card'
                  ? 'bg-white shadow-sm text-primary-600'
                  : 'text-gray-600 hover:text-gray-800'
              ]"
              title="Card view"
              @click="viewMode = 'card'"
            >
              <UIcon
                name="i-heroicons-squares-2x2"
                class="w-4 h-4 sm:w-5 sm:h-5"
              />
            </button>
            <button
              :class="[
                'p-1.5 rounded transition-colors',
                viewMode === 'compact'
                  ? 'bg-white shadow-sm text-primary-600'
                  : 'text-gray-600 hover:text-gray-800'
              ]"
              title="Compact view"
              @click="viewMode = 'compact'"
            >
              <UIcon
                name="i-heroicons-bars-3"
                class="w-4 h-4 sm:w-5 sm:h-5"
              />
            </button>
          </div>
        </div>

        <EventList
          :events="upcomingEvents"
          :view-mode="viewMode"
        />

        <p
          v-if="pastEventsCount > 0"
          class="text-sm text-gray-500 mt-4"
        >
          {{ pastEventsCount }} past event{{ pastEventsCount === 1 ? '' : 's' }}
        </p>
      </div>
    </div>

    <BackToTop />
    <FloatingChatButton always-visible />
  </div>
</template>
