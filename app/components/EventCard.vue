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

const formattedTime = computed(() => {
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

// Get display image - prefer event image, fallback to venue logo
const displayImage = computed(() => {
  return props.event.imageUrl || props.event.venue?.logoUrl
})

// Check if we're using venue logo as fallback (for styling purposes)
const isVenueLogo = computed(() => {
  return !props.event.imageUrl && props.event.venue?.logoUrl
})

// Check if description is long enough to warrant expansion
const hasLongDescription = computed(() => {
  return props.event.description && props.event.description.length > 150
})

const truncatedDescription = computed(() => {
  if (!props.event.description) return ''
  if (!hasLongDescription.value) return props.event.description
  return props.event.description.slice(0, 150) + '...'
})
</script>

<template>
  <UCard class="hover:shadow-lg transition-all duration-200 border-l-4 border-l-black overflow-hidden" :ui="{ body: displayImage ? 'p-0 sm:p-0' : undefined }">
    <!-- Mobile-first: Stacked layout, horizontal on md+ -->
    <div class="flex flex-col md:flex-row">
      <!-- Image - Full width edge-to-edge on mobile, fixed width on desktop -->
      <!-- Shows event image or venue logo as fallback -->
      <div v-if="displayImage" class="flex-shrink-0 w-full md:w-64 lg:w-72 overflow-hidden bg-black flex items-center justify-center" :class="isVenueLogo ? 'aspect-video md:aspect-square p-4' : 'aspect-square'">
        <img
          :src="displayImage"
          :alt="event.title"
          :class="isVenueLogo ? 'max-w-full max-h-full object-contain' : 'max-w-full max-h-full object-contain'"
          loading="lazy"
        >
      </div>

      <!-- Date Block (only show if no image) - Horizontal on mobile, vertical on md+ -->
      <div
        v-else
        class="flex md:flex-col items-center md:items-stretch gap-3 md:gap-0 flex-shrink-0 md:w-20 md:text-center py-1"
      >
        <div class="bg-primary-50 rounded-lg px-4 py-2 md:px-2 md:py-3 flex md:flex-col items-center md:items-stretch gap-2 md:gap-0">
          <div class="text-xs font-medium text-primary-600 uppercase tracking-wide">
            {{ formattedDate.weekday }}
          </div>
          <div class="text-2xl md:text-3xl font-bold text-primary-700">
            {{ formattedDate.day }}
          </div>
          <div class="text-sm font-medium text-primary-600 uppercase">
            {{ formattedDate.month }}
          </div>
        </div>
        <div class="flex md:flex-col items-center gap-2 md:gap-0 md:mt-2">
          <div class="text-sm font-medium text-gray-700">
            {{ formattedTime }}
          </div>
          <div
            v-if="doorsTime"
            class="text-xs text-gray-500"
          >
            Doors {{ doorsTime }}
          </div>
        </div>
      </div>

      <!-- Event Details - add padding when image is present since card body has no padding -->
      <div
        class="flex-1 min-w-0"
        :class="displayImage ? 'p-4 md:py-4 md:pr-4 md:pl-4 lg:pl-6' : 'py-1'"
      >
        <!-- Date/Time row -->
        <div class="flex flex-wrap items-center gap-1 sm:gap-2 text-sm text-gray-600 mb-1">
          <UIcon
            name="i-heroicons-calendar"
            class="w-4 h-4 text-primary-500"
          />
          <span class="font-medium">{{ formattedDate.weekday }}, {{ formattedDate.month }} {{ formattedDate.day }}</span>
          <span class="text-gray-400">at</span>
          <span>{{ formattedTime }}</span>
          <span
            v-if="doorsTime"
            class="text-gray-400 hidden sm:inline"
          >(doors {{ doorsTime }})</span>
        </div>

        <NuxtLink
          :to="`/events/${event.slug}`"
          class="block group"
        >
          <h3 class="font-bold text-lg sm:text-xl text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-2">
            {{ event.title }}
          </h3>
        </NuxtLink>

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
      <div
        class="hidden lg:flex flex-shrink-0 flex-col justify-center gap-2"
        :class="event.imageUrl ? 'p-4 pl-0' : ''"
      >
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
