<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

const props = defineProps<{
  event: Event
  hideDate?: boolean
  hideVenue?: boolean
  hideEventType?: boolean
  recommendationReason?: string
  recommendationScore?: number
}>()

// Show "Good Match" badge for better recommendations (score >= 20 on 0-100 scale)
const isGoodMatch = computed(() => props.recommendationScore && props.recommendationScore >= 20)

const { getGenreLabel, getGenreColor } = useGenreLabels()
const { getEventTypeLabel, getEventTypeColor } = useEventTypeLabels()
const { formatTime } = useEventTime()

// Get full badge classes with colors
const eventTypeBadgeClass = computed(() => {
  const color = getEventTypeColor(props.event.eventType)
  const colorMap: Record<string, string> = {
    'primary': 'bg-blue-100',
    'gray': 'bg-gray-100',
    'red': 'bg-red-100',
    'orange': 'bg-orange-100',
    'amber': 'bg-amber-100',
    'yellow': 'bg-yellow-100',
    'lime': 'bg-lime-100',
    'green': 'bg-green-100',
    'emerald': 'bg-emerald-100',
    'teal': 'bg-teal-100',
    'cyan': 'bg-cyan-100',
    'sky': 'bg-sky-100',
    'blue': 'bg-blue-100',
    'indigo': 'bg-indigo-100',
    'violet': 'bg-violet-100',
    'purple': 'bg-purple-100',
    'fuchsia': 'bg-fuchsia-100',
    'pink': 'bg-pink-100',
    'rose': 'bg-rose-100',
  }
  return colorMap[color] || 'bg-blue-100'
})

const genreBadgeClass = computed(() => {
  if (!primaryGenre.value) return ''
  const color = getGenreColor(primaryGenre.value)
  const colorMap: Record<string, string> = {
    'primary': 'bg-blue-100',
    'gray': 'bg-gray-100',
    'red': 'bg-red-100',
    'orange': 'bg-orange-100',
    'amber': 'bg-amber-100',
    'yellow': 'bg-yellow-100',
    'lime': 'bg-lime-100',
    'green': 'bg-green-100',
    'emerald': 'bg-emerald-100',
    'teal': 'bg-teal-100',
    'cyan': 'bg-cyan-100',
    'sky': 'bg-sky-100',
    'blue': 'bg-blue-100',
    'indigo': 'bg-indigo-100',
    'violet': 'bg-violet-100',
    'purple': 'bg-purple-100',
    'fuchsia': 'bg-fuchsia-100',
    'pink': 'bg-pink-100',
    'rose': 'bg-rose-100',
  }
  return colorMap[color] || 'bg-blue-100'
})

// formattedDate is available but not used in compact view since we don't show date badges
// Keeping it for potential future use
// const formattedDate = computed(() => {
//   const date = new Date(props.event.startsAt)
//   return {
//     month: date.toLocaleDateString('en-US', { month: 'short' }),
//     day: date.getDate(),
//   }
// })

// Get timezone from event's venue region, fallback to default
const eventTimezone = computed(() => props.event.venue?.region?.timezone || 'America/New_York')

const formattedTime = computed(() => {
  // Don't show timezone in compact view to save space
  return formatTime(props.event.startsAt, eventTimezone.value, { includeTimezone: 'never' })
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

// Get event type label with friendly name
const eventTypeLabel = computed(() => {
  return getEventTypeLabel(props.event.eventType)
})

// categoryDisplay combines category and genre for display
// Not used in compact view since we show badges separately
// Keeping it for potential future use
// const categoryDisplay = computed(() => {
//   const genreLabel = primaryGenre.value ? getGenreLabel(primaryGenre.value) : null
//
//   if (eventTypeLabel.value && genreLabel) {
//     return `${eventTypeLabel.value}: ${genreLabel}`
//   }
//   if (eventTypeLabel.value) {
//     return eventTypeLabel.value
//   }
//   if (genreLabel) {
//     return genreLabel
//   }
//   return null
// })
</script>

<template>
  <tr class="group hover:bg-gray-50 transition-colors border-b border-gray-200 last:border-0">
    <!-- Time Column -->
    <td class="py-1 px-2 sm:px-3 text-xs sm:text-sm text-gray-900 whitespace-nowrap">
      <span v-if="formattedTime">{{ formattedTime }}</span>
      <span
        v-else
        class="text-gray-500"
      >TBA</span>
    </td>

    <!-- Title with badges -->
    <td class="py-1 px-2 sm:px-3">
      <NuxtLink
        :to="`/events/${event.slug}`"
        class="block"
      >
        <div class="flex items-center gap-2">
          <div
            class="font-semibold text-sm sm:text-base text-gray-900 truncate group-hover:text-primary-600 transition-colors flex-1"
            :title="event.title"
          >
            {{ event.title }}
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <span
              v-if="eventTypeLabel && !hideEventType"
              class="items-center px-2 py-0.5 rounded text-xs font-medium text-gray-900"
              :class="[eventTypeBadgeClass, event.eventType === 'MUSIC' ? 'hidden sm:inline-flex' : 'inline-flex']"
            >
              {{ eventTypeLabel }}
            </span>
            <span
              v-if="primaryGenre"
              class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-gray-900"
              :class="genreBadgeClass"
            >
              {{ getGenreLabel(primaryGenre) }}
            </span>
          </div>
        </div>
        <!-- Recommendation reason -->
        <div
          v-if="recommendationReason"
          class="flex items-start gap-1 text-xs text-primary-600 mt-0.5"
        >
          <UIcon
            name="i-heroicons-light-bulb"
            class="w-3 h-3 flex-shrink-0 mt-0.5"
          />
          <span class="flex items-center gap-1.5">
            <span
              v-if="isGoodMatch"
              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-sm"
            >
              <UIcon
                name="i-heroicons-check-circle-solid"
                class="w-2.5 h-2.5"
              />
              Good Match
            </span>
            {{ recommendationReason }}
          </span>
        </div>
      </NuxtLink>
    </td>

    <!-- Venue -->
    <td
      v-if="!hideVenue"
      class="py-1 px-2 sm:px-3 hidden sm:table-cell"
    >
      <div class="flex items-center gap-1">
        <div
          class="text-sm text-gray-900 truncate flex-1"
          :title="event.venue?.name || 'TBA'"
        >
          <UIcon
            name="i-heroicons-map-pin"
            class="w-3.5 h-3.5 inline mr-1"
          />
          {{ event.venue?.name || 'TBA' }}
        </div>
        <span
          v-if="event.venue?.city"
          class="flex-shrink-0 text-xs text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded"
          :title="event.venue.city"
        >
          {{ event.venue.city }}
        </span>
      </div>
    </td>
  </tr>
</template>
