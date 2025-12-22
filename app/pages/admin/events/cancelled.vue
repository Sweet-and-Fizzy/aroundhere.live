<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

const searchQuery = ref('')
const sortOrder = ref<'asc' | 'desc'>('desc')

const { data: response, refresh } = await useFetch('/api/admin/events/cancelled')
const allEvents = computed(() => response.value?.events || [])
const total = computed(() => response.value?.pagination?.total || 0)

// Filtered and sorted events
const events = computed(() => {
  let filtered = allEvents.value

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter((event: any) =>
      event.title?.toLowerCase().includes(query) ||
      event.venue?.name?.toLowerCase().includes(query) ||
      event.venue?.city?.toLowerCase().includes(query) ||
      event.source?.name?.toLowerCase().includes(query)
    )
  }

  // Apply sort
  return [...filtered].sort((a: any, b: any) => {
    const dateA = new Date(a.startsAt).getTime()
    const dateB = new Date(b.startsAt).getTime()
    return sortOrder.value === 'asc' ? dateA - dateB : dateB - dateA
  })
})

const filteredTotal = computed(() => events.value.length)

const toast = useToast()
const restoring = ref<string | null>(null)

async function restoreEvent(eventId: string) {
  restoring.value = eventId
  try {
    await $fetch(`/api/events/${eventId}/cancel`, {
      method: 'PATCH',
      body: { isCancelled: false },
    })
    toast.add({
      title: 'Success',
      description: 'Event restored successfully',
      color: 'success',
    })
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to restore event',
      color: 'error',
    })
  } finally {
    restoring.value = null
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toggleSort() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
}

useSeoMeta({
  title: 'Admin - Cancelled Events',
  description: 'View and restore cancelled events',
})
</script>

<template>
  <div class="px-4 py-8 max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">
        Cancelled Events
      </h1>
      <span class="text-sm text-gray-500">
        {{ filteredTotal }} of {{ total }} event{{ total === 1 ? '' : 's' }}
      </span>
    </div>

    <!-- Search and Sort Controls -->
    <div class="bg-white rounded-lg shadow p-4 mb-4">
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="flex-1">
          <UInput
            v-model="searchQuery"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search by event name, venue, city, or source..."
            size="lg"
          />
        </div>
        <UButton
          :icon="sortOrder === 'desc' ? 'i-heroicons-arrow-down' : 'i-heroicons-arrow-up'"
          size="lg"
          color="neutral"
          variant="outline"
          @click="toggleSort"
        >
          Date: {{ sortOrder === 'desc' ? 'Newest First' : 'Oldest First' }}
        </UButton>
      </div>
    </div>

    <div
      v-if="events.length === 0"
      class="bg-white rounded-lg shadow p-8 text-center text-gray-500"
    >
      {{ searchQuery ? 'No cancelled events match your search' : 'No cancelled events found' }}
    </div>

    <div
      v-else
      class="bg-white rounded-lg shadow overflow-hidden"
    >
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Event
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Venue
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Source
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr
            v-for="event in events"
            :key="event.id"
          >
            <td class="px-6 py-4">
              <NuxtLink
                :to="`/events/${event.slug}`"
                class="text-primary-600 hover:text-primary-900 font-medium"
              >
                {{ event.title }}
              </NuxtLink>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ event.venue?.name || 'N/A' }}
              <div
                v-if="event.venue?.city"
                class="text-xs text-gray-500"
              >
                {{ event.venue.city }}, {{ event.venue.state }}
              </div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
              {{ formatDate(event.startsAt) }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ event.source?.name || 'N/A' }}
            </td>
            <td class="px-6 py-4 text-sm">
              <UButton
                color="success"
                variant="soft"
                size="xs"
                :loading="restoring === event.id"
                @click="restoreEvent(event.id)"
              >
                Restore
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
