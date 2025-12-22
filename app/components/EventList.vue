<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

const props = defineProps<{
  events: Event[]
  loading?: boolean
  viewMode?: 'card' | 'compact'
  hideVenue?: boolean
  activeEventTypes?: string[]
}>()

// Group events by local date for compact view
const eventsByDate = computed(() => {
  const grouped = new Map<string, Event[]>()

  props.events.forEach(event => {
    const date = new Date(event.startsAt)
    // Use local date components instead of UTC to match displayed times
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateKey = `${year}-${month}-${day}`

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, [])
    }
    grouped.get(dateKey)!.push(event)
  })

  // Sort events within each group by time (they should already be sorted, but ensure it)
  return Array.from(grouped.entries()).map(([dateKey, events]) => ({
    dateKey,
    date: new Date(dateKey + 'T00:00:00'), // Parse as local date
    events: events.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  }))
})

function formatDateHeader(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const eventDate = new Date(date)
  eventDate.setHours(0, 0, 0, 0)

  const daysDiff = Math.floor((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const todayDayOfWeek = today.getDay()

  // Calculate days until this weekend (Saturday)
  const daysUntilSaturday = (6 - todayDayOfWeek + 7) % 7 || 7
  const daysUntilSunday = daysUntilSaturday + 1

  // Format the base date string
  const baseDateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const withYear = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // Today
  if (daysDiff === 0) {
    return `Today · ${baseDateStr}`
  }

  // Tomorrow
  if (daysDiff === 1) {
    return `Tomorrow · ${baseDateStr}`
  }

  // This weekend (Saturday or Sunday of current week)
  if (daysDiff === daysUntilSaturday || daysDiff === daysUntilSunday) {
    return `This Weekend · ${baseDateStr}`
  }

  // Later this week (within 6 days, not weekend)
  if (daysDiff > 1 && daysDiff <= 6) {
    return `This ${date.toLocaleDateString('en-US', { weekday: 'long' })} · ${baseDateStr}`
  }

  // Next week (7-13 days out)
  if (daysDiff >= 7 && daysDiff <= 13) {
    return `Next ${date.toLocaleDateString('en-US', { weekday: 'long' })} · ${baseDateStr}`
  }

  // Within the next month
  if (daysDiff > 13 && daysDiff <= 30) {
    const weeksOut = Math.ceil(daysDiff / 7)
    return `In ${weeksOut} weeks · ${baseDateStr}`
  }

  // Further out - just show the date with year
  return withYear
}
</script>

<template>
  <div class="space-y-3">
    <!-- Loading State - shown as overlay -->
    <div
      v-if="loading && events.length === 0"
      class="space-y-3"
    >
      <USkeleton
        v-for="i in 5"
        :key="i"
        class="h-32 w-full"
      />
    </div>

    <!-- Empty State -->
    <UCard
      v-else-if="!loading && events.length === 0"
      class="text-center py-12"
    >
      <UIcon
        name="i-heroicons-calendar-days"
        class="w-12 h-12 mx-auto text-gray-400"
      />
      <h3 class="mt-4 text-lg font-medium text-gray-900">
        No events found
      </h3>
      <p class="mt-2 text-gray-500">
        Try adjusting your filters or check back later.
      </p>
    </UCard>

    <!-- Events List - Card View (Grouped by Date) -->
    <div
      v-if="viewMode === 'card'"
      v-show="events.length > 0"
      class="space-y-6 relative"
      :class="{ 'opacity-50 pointer-events-none': loading }"
    >
      <div
        v-for="dateGroup in eventsByDate"
        :key="dateGroup.dateKey"
      >
        <!-- Date Header -->
        <div class="flex items-center gap-3 mb-3">
          <h3 class="font-semibold text-gray-700 text-sm sm:text-base whitespace-nowrap">
            {{ formatDateHeader(dateGroup.date) }}
          </h3>
          <div class="flex-1 h-px bg-gray-300" />
        </div>

        <!-- Events for this date -->
        <TransitionGroup
          name="event-list"
          tag="div"
          class="space-y-3"
        >
          <EventCard
            v-for="event in dateGroup.events"
            :key="event.id"
            :event="event"
          />
        </TransitionGroup>
      </div>
    </div>

    <!-- Events List - Compact View (Grouped by Date) -->
    <div
      v-else-if="viewMode === 'compact'"
      v-show="events.length > 0"
      class="relative space-y-3"
      :class="{ 'opacity-50 pointer-events-none': loading }"
    >
      <div
        v-for="dateGroup in eventsByDate"
        :key="dateGroup.dateKey"
        class="border border-gray-300 rounded-lg bg-white shadow-sm"
      >
        <!-- Date Header (sticky) -->
        <div class="bg-gray-700 px-4 py-2 sticky top-0 z-20 rounded-t-lg">
          <h3 class="font-semibold text-white text-sm sm:text-base">
            {{ formatDateHeader(dateGroup.date) }}
          </h3>
        </div>

        <!-- Table layout for perfect alignment -->
        <table class="w-full table-fixed">
          <colgroup v-if="hideVenue">
            <col class="w-[70px] sm:w-20">
            <col>
          </colgroup>
          <colgroup v-else>
            <col class="w-[70px] sm:w-20">
            <col>
            <col class="hidden sm:table-column sm:w-[32%]">
          </colgroup>
          <thead class="bg-gray-100 border-y border-gray-300 sticky top-[38px] sm:top-[42px] z-10">
            <tr class="text-xs text-gray-600 font-medium uppercase tracking-wide">
              <th class="text-left py-1.5 px-2 sm:px-3">
                Time
              </th>
              <th class="text-left py-1.5 px-2 sm:px-3">
                Event
              </th>
              <th
                v-if="!hideVenue"
                class="text-left py-1.5 px-2 sm:px-3 hidden sm:table-cell"
              >
                Venue
              </th>
            </tr>
          </thead>
          <tbody>
            <EventCardCompact
              v-for="event in dateGroup.events"
              :key="event.id"
              :event="event"
              :hide-date="true"
              :hide-venue="hideVenue"
              :hide-event-type="activeEventTypes?.length === 1"
            />
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style>
.event-list-enter-active {
  transition: all 0.3s ease;
}

.event-list-leave-active {
  transition: all 0.2s ease;
  position: absolute;
  width: 100%;
}

.event-list-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.event-list-leave-to {
  opacity: 0;
}

.event-list-move {
  transition: transform 0.3s ease;
}
</style>
