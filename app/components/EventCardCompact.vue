<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

const props = defineProps<{
  event: Event
  hideDate?: boolean
}>()

const formattedDate = computed(() => {
  const date = new Date(props.event.startsAt)
  return {
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

// Get first genre for display
const primaryGenre = computed(() => {
  if (props.event.canonicalGenres?.length) {
    return props.event.canonicalGenres[0]
  }
  if (props.event.genres?.length) {
    return props.event.genres[0]
  }
  return null
})

// Get event type badge color
const eventTypeBadgeColor = computed(() => {
  const type = props.event.eventType
  if (type === 'MUSIC') return 'primary'
  if (type === 'FILM') return 'purple'
  if (type === 'THEATER') return 'rose'
  if (type === 'COMEDY') return 'amber'
  if (type === 'ART') return 'teal'
  return 'gray'
})
</script>

<template>
  <NuxtLink
    :to="`/events/${event.slug}`"
    class="group block hover:bg-gray-50 transition-colors border-b border-gray-200 last:border-0"
  >
    <div class="flex items-center gap-2 sm:gap-3 md:gap-4 py-2 px-2 sm:px-3">
      <!-- Date Column - Fixed width (hidden when grouped by date) -->
      <div
        v-if="!hideDate"
        class="flex-shrink-0 text-center w-12 sm:w-14"
      >
        <div class="text-xs sm:text-sm font-medium text-gray-600 uppercase">
          {{ formattedDate.month }}
        </div>
        <div class="text-lg sm:text-xl font-bold text-gray-900">
          {{ formattedDate.day }}
        </div>
      </div>

      <!-- Time Column - Fixed width -->
      <div class="flex-shrink-0 w-14 sm:w-16 text-xs sm:text-sm text-gray-700">
        <span v-if="formattedTime">{{ formattedTime }}</span>
        <span v-else class="text-gray-500">TBA</span>
      </div>

      <!-- Title - Flexible, truncates -->
      <div class="flex-1 min-w-0 pr-2">
        <div class="font-semibold text-sm sm:text-base text-gray-900 truncate group-hover:text-primary-600 transition-colors">
          {{ event.title }}
        </div>
      </div>

      <!-- Venue - Flexible, truncates on mobile -->
      <div class="hidden sm:block flex-1 min-w-0 pr-2">
        <div class="text-sm text-gray-700 truncate">
          <UIcon
            name="i-heroicons-map-pin"
            class="w-3.5 h-3.5 inline mr-1"
          />
          {{ event.venue?.name || 'TBA' }}
        </div>
      </div>

      <!-- Type Badge - Fixed width, hidden on mobile -->
      <div class="hidden md:block flex-shrink-0 w-20">
        <UBadge
          v-if="event.eventType"
          :color="eventTypeBadgeColor"
          variant="soft"
          size="xs"
          class="w-full justify-center"
        >
          {{ event.eventType }}
        </UBadge>
      </div>

      <!-- Genre - Fixed width, truncates -->
      <div class="hidden lg:block flex-shrink-0 w-24 xl:w-28">
        <div
          v-if="primaryGenre"
          class="text-xs text-gray-600 truncate"
        >
          <UIcon
            name="i-heroicons-musical-note"
            class="w-3 h-3 inline mr-1"
          />
          {{ primaryGenre }}
        </div>
      </div>

      <!-- Chevron -->
      <div class="flex-shrink-0">
        <UIcon
          name="i-heroicons-chevron-right"
          class="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 group-hover:text-primary-600 transition-colors"
        />
      </div>
    </div>
  </NuxtLink>
</template>
