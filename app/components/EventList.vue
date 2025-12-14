<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

const props = defineProps<{
  events: Event[]
  loading?: boolean
  viewMode?: 'card' | 'compact'
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
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const eventDate = new Date(date)
  eventDate.setHours(0, 0, 0, 0)

  if (eventDate.getTime() === today.getTime()) {
    return 'Today - ' + date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  } else if (eventDate.getTime() === tomorrow.getTime()) {
    return 'Tomorrow - ' + date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }
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

    <!-- Events List - Card View -->
    <TransitionGroup
      v-if="viewMode === 'card'"
      v-show="events.length > 0"
      name="event-list"
      tag="div"
      class="space-y-3 relative"
      :class="{ 'opacity-50 pointer-events-none': loading }"
    >
      <EventCard
        v-for="event in events"
        :key="event.id"
        :event="event"
      />
    </TransitionGroup>

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

        <!-- Column Headers (sticky below date header) -->
        <div class="bg-gray-100 border-y border-gray-300 px-2 sm:px-3 sticky top-[38px] sm:top-[42px] z-10">
          <div class="flex items-center gap-2 sm:gap-3 md:gap-4 py-1.5 text-xs text-gray-600 font-medium uppercase tracking-wide">
            <div class="flex-shrink-0 w-14 sm:w-16">
              Time
            </div>
            <div class="flex-1 min-w-0 pr-2">
              Event
            </div>
            <div class="hidden sm:block flex-1 min-w-0 pr-2">
              Venue
            </div>
            <div class="hidden md:block flex-shrink-0 w-24 lg:w-28 xl:w-32">
              Category
            </div>
            <div class="flex-shrink-0 w-4 sm:w-5">
              <!-- Chevron spacer -->
            </div>
          </div>
        </div>

        <!-- Events for this date -->
        <div>
          <EventCardCompact
            v-for="event in dateGroup.events"
            :key="event.id"
            :event="event"
            :hide-date="true"
          />
        </div>
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
