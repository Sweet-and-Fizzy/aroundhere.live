<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

defineProps<{
  events: Event[]
  loading?: boolean
}>()
</script>

<template>
  <div class="space-y-4">
    <!-- Loading State - shown as overlay -->
    <div
      v-if="loading && events.length === 0"
      class="space-y-4"
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

    <!-- Events List - always rendered when we have events -->
    <TransitionGroup
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
