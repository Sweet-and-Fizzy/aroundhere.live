<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

defineProps<{
  events: Event[]
  loading?: boolean
}>()
</script>

<template>
  <div class="space-y-4">
    <!-- Loading State -->
    <div
      v-if="loading"
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
      v-else-if="events.length === 0"
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

    <!-- Events List -->
    <div
      v-else
      class="space-y-3"
    >
      <EventCard
        v-for="event in events"
        :key="event.id"
        :event="event"
      />
    </div>
  </div>
</template>
