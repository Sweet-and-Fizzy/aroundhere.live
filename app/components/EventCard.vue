<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

const props = defineProps<{
  event: Event
}>()

const expanded = ref(false)
const imageLoaded = ref(false)
const { getGenreLabel, getGenreBadgeClasses } = useGenreLabels()
const { getEventTypeLabel, getEventTypeBadgeClasses } = useEventTypeLabels()
const { formatTime, getDateParts } = useEventTime()

function onImageLoad() {
  imageLoaded.value = true
}

// Get timezone from event's venue region, fallback to default
const eventTimezone = computed(() => props.event.venue?.region?.timezone || 'America/New_York')

const formattedDate = computed(() => {
  return getDateParts(props.event.startsAt, eventTimezone.value)
})

const formattedTime = computed(() => {
  return formatTime(props.event.startsAt, eventTimezone.value)
})

const doorsTime = computed(() => {
  if (!props.event.doorsAt) return null
  return formatTime(props.event.doorsAt, eventTimezone.value)
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

// Find first artist with verified Spotify match
const spotifyArtist = computed(() => {
  return props.event.eventArtists?.find(ea =>
    ea.artist.spotifyId && ['AUTO_MATCHED', 'VERIFIED'].includes(ea.artist.spotifyMatchStatus || '')
  )?.artist
})


// For display: use summary if available, otherwise truncate description
const displaySummary = computed(() => {
  if (props.event.summary) return props.event.summary
  if (!props.event.description) return ''
  // Truncate long descriptions to ~200 chars at word boundary
  if (props.event.description.length <= 200) return props.event.description
  const truncated = props.event.description.slice(0, 200)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 150 ? truncated.slice(0, lastSpace) : truncated) + '...'
})

// Full description for expanded view - prefer HTML
const fullDescription = computed(() => {
  return props.event.descriptionHtml || props.event.description || ''
})

// Show expand button if there's more content in full description than summary
const hasMoreContent = computed(() => {
  if (!fullDescription.value) return false
  // If we have a summary and a longer full description, show expand
  if (props.event.summary && fullDescription.value.length > props.event.summary.length + 50) {
    return true
  }
  // If no summary but description is long, show expand
  if (!props.event.summary && props.event.description && props.event.description.length > 200) {
    return true
  }
  return false
})

// Get event type label with friendly name
const eventTypeLabel = computed(() => {
  return getEventTypeLabel(props.event.eventType)
})

</script>

<template>
  <UCard
    class="hover:shadow-lg transition-all duration-200 border-l-4 border-l-black overflow-hidden"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <!-- Mobile-first: Stacked layout, horizontal on md+ -->
    <div class="flex flex-col md:flex-row relative">
      <!-- Spotify button - top right corner (desktop only, over image) -->
      <div class="hidden md:flex absolute top-2 right-2 z-10 items-center gap-1">
        <a
          v-if="spotifyArtist"
          :href="`https://open.spotify.com/artist/${spotifyArtist.spotifyId}`"
          target="_blank"
          class="p-1.5 text-[#1DB954] hover:text-[#1ed760] transition-colors bg-white/90 backdrop-blur-sm rounded-full"
          title="Listen on Spotify"
          @click.stop
        >
          <SpotifyIcon class="w-5 h-5" />
        </a>
      </div>
      <!-- Image - Full width edge-to-edge on mobile, fixed width on desktop -->
      <!-- Only shows actual event images, not venue logos -->
      <NuxtLink
        v-if="event.imageUrl"
        :to="`/events/${event.slug}`"
        class="flex-shrink-0 w-full md:w-56 lg:w-64 overflow-hidden bg-gray-900 flex items-center justify-center aspect-video md:aspect-square relative"
      >
        <!-- Placeholder shown only while loading -->
        <div
          v-if="!imageLoaded"
          class="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900"
        />
        <img
          :src="event.imageUrl"
          :alt="event.title"
          class="max-w-full max-h-full object-contain"
          :class="imageLoaded ? 'opacity-100' : 'opacity-0 blur-sm scale-105 transition-all duration-200'"
          loading="lazy"
          @load="onImageLoad"
        >
      </NuxtLink>

      <!-- Fallback: Event title at venue on black background -->
      <NuxtLink
        v-else
        :to="`/events/${event.slug}`"
        class="flex-shrink-0 w-full md:w-56 lg:w-64 aspect-video md:aspect-square bg-black flex items-center justify-center p-4"
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
      </NuxtLink>

      <!-- Event Details - add padding since card body has no padding when image/fallback is present -->
      <div class="flex-1 min-w-0 p-3 md:py-3 md:pr-3 md:pl-3 lg:pl-4">
        <!-- Date/Time row -->
        <div class="flex flex-wrap items-center gap-1 sm:gap-2 text-sm text-gray-700 sm:mb-0.5">
          <UIcon
            name="i-heroicons-calendar"
            class="w-4 h-4 text-primary-500"
            aria-hidden="true"
          />
          <time
            class="font-medium"
            :datetime="event.startsAt"
          >{{ formattedDate.weekday }}, {{ formattedDate.month }} {{ formattedDate.day }}</time>
          <template v-if="formattedTime">
            <span class="text-gray-500">at</span>
            <span>{{ formattedTime }}</span>
            <span
              v-if="doorsTime"
              class="text-gray-500 hidden sm:inline"
            >(doors {{ doorsTime }})</span>
          </template>
        </div>

        <div class="flex items-start gap-2">
          <NuxtLink
            :to="`/events/${event.slug}`"
            class="block group flex-1 min-w-0"
          >
            <h3
              class="font-bold text-lg sm:text-xl text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-2"
              :title="event.title"
            >
              {{ event.title }}
            </h3>
          </NuxtLink>
          <!-- Spotify button (mobile only, in content area) -->
          <a
            v-if="spotifyArtist"
            :href="`https://open.spotify.com/artist/${spotifyArtist.spotifyId}`"
            target="_blank"
            class="p-1.5 text-[#1DB954] hover:text-[#1ed760] transition-colors md:hidden flex-shrink-0"
            title="Listen on Spotify"
            @click.stop
          >
            <SpotifyIcon class="w-5 h-5" />
          </a>
        </div>

        <div
          v-if="event.venue"
          class="mt-0.5 flex items-center gap-1.5"
        >
          <NuxtLink
            :to="`/venues/${event.venue.slug}`"
            class="inline-flex items-center gap-1.5 text-sm text-gray-900 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-map-pin"
              class="w-4 h-4"
              aria-hidden="true"
            />
            <span class="font-medium">{{ event.venue.name }}</span>
          </NuxtLink>
          <span
            v-if="event.venue.city"
            class="flex-shrink-0 text-xs text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded"
            :title="event.venue.city"
          >
            {{ event.venue.city }}
          </span>
        </div>

        <!-- Badges - Order: Event Type, Genres, Ticket Price, Age Restriction -->
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1.5">
          <!-- Event Type -->
          <UBadge
            v-if="eventTypeLabel"
            :ui="{
              base: getEventTypeBadgeClasses(event.eventType)
            }"
            size="md"
            :aria-label="`Event type: ${eventTypeLabel}`"
          >
            {{ eventTypeLabel }}
          </UBadge>

          <!-- Genres -->
          <UBadge
            v-for="genre in displayGenres"
            :key="genre"
            :ui="{
              base: getGenreBadgeClasses(genre)
            }"
            size="md"
            :aria-label="`Genre: ${getGenreLabel(genre)}`"
          >
            <UIcon
              name="i-heroicons-musical-note"
              class="w-3.5 h-3.5 mr-1"
              aria-hidden="true"
            />
            {{ getGenreLabel(genre) }}
          </UBadge>

          <!-- Ticket Price -->
          <UBadge
            v-if="event.coverCharge"
            color="success"
            variant="soft"
            size="sm"
            :aria-label="`Price: ${event.coverCharge}`"
            class="!text-gray-900"
          >
            <UIcon
              name="i-heroicons-ticket"
              class="w-3 h-3 mr-1"
              aria-hidden="true"
            />
            {{ event.coverCharge }}
          </UBadge>

          <!-- Age Restriction -->
          <UBadge
            v-if="event.ageRestriction && event.ageRestriction !== 'ALL_AGES'"
            color="warning"
            variant="soft"
            size="sm"
            :aria-label="`Age restriction: ${event.ageRestriction.replace(/_/g, ' ').replace('PLUS', '+')}`"
            class="!text-gray-900"
          >
            {{ event.ageRestriction.replace(/_/g, ' ').replace('PLUS', '+') }}
          </UBadge>
        </div>

        <!-- Expandable Description -->
        <div
          v-if="displaySummary || fullDescription"
          class="mt-2"
        >
          <div class="text-sm text-gray-700 prose prose-sm prose-gray max-w-none">
            <div
              v-if="!expanded"
              v-html="displaySummary"
            />
            <div
              v-else
              v-html="fullDescription"
            />
          </div>
          <button
            v-if="hasMoreContent"
            class="text-sm text-primary-600 hover:text-primary-700 font-medium mt-1"
            @click="expanded = !expanded"
          >
            {{ expanded ? 'Show less' : 'Show more' }}
          </button>
        </div>

        <!-- Action buttons - Inline on mobile, separate column on lg+ -->
        <div class="flex flex-wrap items-center justify-between gap-2 mt-2 lg:hidden">
          <div class="flex flex-wrap gap-2">
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
              :to="`/events/${event.slug}`"
              size="sm"
              color="neutral"
              icon="i-heroicons-information-circle"
            >
              More Info
            </UButton>
          </div>
          <EventAttendanceButtons
            :event-id="event.id"
            size="sm"
            show-labels
            progressive
          />
        </div>
      </div>

      <!-- Actions - Desktop only (hidden on mobile, shown at lg+) -->
      <div class="hidden lg:flex flex-shrink-0 flex-col items-end justify-center gap-2 p-3 pl-0">
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
          :to="`/events/${event.slug}`"
          size="sm"
          color="neutral"
          icon="i-heroicons-information-circle"
        >
          More Info
        </UButton>
        <EventAttendanceButtons
          :event-id="event.id"
          size="sm"
          show-labels
          progressive
        />
      </div>
    </div>
  </UCard>
</template>
