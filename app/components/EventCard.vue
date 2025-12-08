<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

const props = defineProps<{
  event: Event
}>()

const expanded = ref(false)

const formattedDate = computed(() => {
  const date = new Date(props.event.startsAt)
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    day: date.getDate(),
  }
})

// Check if time is midnight (indicating no time was specified)
const hasSpecificTime = computed(() => {
  const date = new Date(props.event.startsAt)
  return date.getHours() !== 0 || date.getMinutes() !== 0
})

const formattedTime = computed(() => {
  if (!hasSpecificTime.value) return null
  const date = new Date(props.event.startsAt)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
})

const doorsTime = computed(() => {
  if (!props.event.doorsAt) return null
  const date = new Date(props.event.doorsAt)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
})

// Get genres - prefer canonical genres from classifier, then raw genres, then artist genres
const displayGenres = computed(() => {
  // First check classified canonical genres (normalized)
  if (props.event.canonicalGenres?.length) {
    return props.event.canonicalGenres.slice(0, 3)
  }
  // Fallback to raw event-level genres from scraper
  if (props.event.genres?.length) {
    return props.event.genres.slice(0, 3)
  }
  // Fallback to genres from manually associated artists
  const genres = new Set<string>()
  props.event.eventArtists?.forEach(ea => {
    ea.artist.genres?.forEach(g => genres.add(g))
  })
  return Array.from(genres).slice(0, 3)
})

// Check if description is long enough to warrant expansion
const hasLongDescription = computed(() => {
  return props.event.description && props.event.description.length > 150
})

// Find first artist with verified Spotify match
const spotifyArtist = computed(() => {
  return props.event.eventArtists?.find(ea =>
    ea.artist.spotifyId && ['AUTO_MATCHED', 'VERIFIED'].includes(ea.artist.spotifyMatchStatus || '')
  )?.artist
})

const truncatedDescription = computed(() => {
  if (!props.event.description) return ''
  if (!hasLongDescription.value) return props.event.description
  return props.event.description.slice(0, 150) + '...'
})
</script>

<template>
  <UCard
    class="hover:shadow-lg transition-all duration-200 border-l-4 border-l-black overflow-hidden"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <!-- Mobile-first: Stacked layout, horizontal on md+ -->
    <div class="flex flex-col md:flex-row">
      <!-- Image - Full width edge-to-edge on mobile, fixed width on desktop -->
      <!-- Only shows actual event images, not venue logos -->
      <div
        v-if="event.imageUrl"
        class="flex-shrink-0 w-full md:w-64 lg:w-72 overflow-hidden bg-black flex items-center justify-center aspect-square"
      >
        <img
          :src="event.imageUrl"
          :alt="event.title"
          class="max-w-full max-h-full object-contain"
          loading="lazy"
        >
      </div>

      <!-- Fallback: Event title at venue on black background -->
      <div
        v-else
        class="flex-shrink-0 w-full md:w-64 lg:w-72 aspect-video md:aspect-square bg-black flex items-center justify-center p-4"
      >
        <div class="text-center">
          <div class="text-white font-bold text-xl sm:text-2xl leading-tight line-clamp-3">
            {{ event.title }}
          </div>
          <div
            v-if="event.venue"
            class="text-gray-300 text-sm mt-2"
          >
            at {{ event.venue.name }}
          </div>
        </div>
      </div>

      <!-- Event Details - add padding since card body has no padding when image/fallback is present -->
      <div class="flex-1 min-w-0 p-4 md:py-4 md:pr-4 md:pl-4 lg:pl-6">
        <!-- Date/Time row -->
        <div class="flex flex-wrap items-center gap-1 sm:gap-2 text-sm text-gray-600 mb-1">
          <UIcon
            name="i-heroicons-calendar"
            class="w-4 h-4 text-primary-500"
          />
          <span class="font-medium">{{ formattedDate.weekday }}, {{ formattedDate.month }} {{ formattedDate.day }}</span>
          <template v-if="formattedTime">
            <span class="text-gray-400">at</span>
            <span>{{ formattedTime }}</span>
            <span
              v-if="doorsTime"
              class="text-gray-400 hidden sm:inline"
            >(doors {{ doorsTime }})</span>
          </template>
        </div>

        <div class="flex items-start gap-2">
          <NuxtLink
            :to="`/events/${event.slug}`"
            class="block group flex-1 min-w-0"
          >
            <h3 class="font-bold text-xl sm:text-2xl text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-2">
              {{ event.title }}
            </h3>
          </NuxtLink>
          <a
            v-if="spotifyArtist"
            :href="`https://open.spotify.com/artist/${spotifyArtist.spotifyId}`"
            target="_blank"
            class="flex-shrink-0 text-[#1DB954] hover:text-[#1ed760] transition-colors mt-1"
            title="Listen on Spotify"
            @click.stop
          >
            <SpotifyIcon class="w-5 h-5" />
          </a>
        </div>

        <div
          v-if="event.venue"
          class="mt-1"
        >
          <NuxtLink
            :to="`/venues/${event.venue.slug}`"
            class="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-map-pin"
              class="w-4 h-4"
            />
            <span class="font-medium">{{ event.venue.name }}</span>
            <span
              v-if="event.venue.city"
              class="text-gray-400 hidden sm:inline"
            >
              - {{ event.venue.city }}
            </span>
          </NuxtLink>
        </div>

        <!-- Badges -->
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
          <UBadge
            v-if="event.coverCharge"
            color="success"
            variant="soft"
            size="sm"
          >
            <UIcon
              name="i-heroicons-ticket"
              class="w-3 h-3 mr-1"
            />
            {{ event.coverCharge }}
          </UBadge>
          <UBadge
            v-if="event.ageRestriction && event.ageRestriction !== 'ALL_AGES'"
            color="warning"
            variant="soft"
            size="sm"
          >
            {{ event.ageRestriction.replace(/_/g, ' ').replace('PLUS', '+') }}
          </UBadge>
          <UBadge
            v-for="genre in displayGenres"
            :key="genre"
            color="primary"
            variant="soft"
            size="sm"
          >
            <UIcon
              name="i-heroicons-musical-note"
              class="w-3 h-3 mr-1"
            />
            {{ genre }}
          </UBadge>
        </div>

        <!-- Expandable Description -->
        <div
          v-if="event.description"
          class="mt-3"
        >
          <div class="text-sm text-gray-600">
            <p
              v-if="!expanded"
              class="whitespace-pre-line"
            >
              {{ truncatedDescription }}
            </p>
            <p
              v-else
              class="whitespace-pre-line"
            >
              {{ event.description }}
            </p>
          </div>
          <button
            v-if="hasLongDescription"
            class="text-sm text-primary-600 hover:text-primary-700 font-medium mt-1"
            @click="expanded = !expanded"
          >
            {{ expanded ? 'Show less' : 'Show more' }}
          </button>
        </div>

        <!-- Action buttons - Inline on mobile, separate column on lg+ -->
        <div class="flex flex-wrap gap-2 mt-3 lg:hidden">
          <UButton
            v-if="event.ticketUrl"
            :to="event.ticketUrl"
            target="_blank"
            size="sm"
            color="primary"
            icon="i-heroicons-ticket"
          >
            Tickets
          </UButton>
          <UButton
            v-if="event.sourceUrl"
            :to="event.sourceUrl"
            target="_blank"
            size="sm"
            color="neutral"
            icon="i-heroicons-arrow-top-right-on-square"
          >
            Event Page
          </UButton>
        </div>
      </div>

      <!-- Actions - Desktop only (hidden on mobile, shown at lg+) -->
      <div class="hidden lg:flex flex-shrink-0 flex-col justify-center gap-2 p-4 pl-0">
        <UButton
          v-if="event.ticketUrl"
          :to="event.ticketUrl"
          target="_blank"
          size="md"
          color="primary"
          icon="i-heroicons-ticket"
        >
          Tickets
        </UButton>
        <UButton
          v-if="event.sourceUrl"
          :to="event.sourceUrl"
          target="_blank"
          size="sm"
          color="neutral"
          icon="i-heroicons-arrow-top-right-on-square"
        >
          Event Page
        </UButton>
      </div>
    </div>
  </UCard>
</template>
