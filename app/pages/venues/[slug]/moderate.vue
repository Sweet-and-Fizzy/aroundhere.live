<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
})

const route = useRoute()
const toast = useToast()
const slug = route.params.slug as string

const statusFilter = ref('PENDING')
const actioningId = ref<string | null>(null)

// First fetch the venue to get its ID
const { data: venueData, error: venueError } = await useFetch(`/api/venues/${slug}`)

if (venueError.value) {
  throw createError({ statusCode: 404, message: 'Venue not found' })
}

const venue = computed(() => (venueData.value as any)?.venue)
const venueId = computed(() => venue.value?.id)

const { data: response, refresh } = await useFetch(() => `/api/venues/${venueId.value}/submissions`, {
  query: computed(() => ({ status: statusFilter.value })),
  watch: [statusFilter],
})

const submissions = computed(() => (response.value as any)?.items || [])

async function handleAction(eventId: string, action: 'approve' | 'reject') {
  actioningId.value = eventId
  try {
    await $fetch(`/api/venues/${venueId.value}/submissions/${eventId}`, {
      method: 'PATCH',
      body: { action },
    })
    toast.add({ title: `Event ${action}d`, color: 'success' })
    refresh()
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || `Failed to ${action}`, color: 'error' })
  } finally {
    actioningId.value = null
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

useSeoMeta({ title: () => `Moderate - ${venue.value?.name || ''}` })
</script>

<template>
  <div class="px-4 py-8 max-w-4xl mx-auto">
    <div class="flex items-center gap-3 mb-6">
      <NuxtLink
        :to="`/venues/${slug}`"
        class="text-primary-600 hover:text-primary-700"
      >
        <UIcon
          name="i-heroicons-arrow-left"
          class="w-5 h-5"
        />
      </NuxtLink>
      <h1 class="text-3xl font-bold">
        Moderate: {{ venue?.name }}
      </h1>
    </div>

    <!-- Status Filter -->
    <div class="flex gap-2 mb-6">
      <UButton
        v-for="status in ['PENDING', 'APPROVED', 'REJECTED']"
        :key="status"
        :color="statusFilter === status ? 'primary' : 'neutral'"
        :variant="statusFilter === status ? 'solid' : 'outline'"
        size="sm"
        @click="statusFilter = status"
      >
        {{ status.charAt(0) + status.slice(1).toLowerCase() }}
      </UButton>
    </div>

    <div
      v-if="submissions.length === 0"
      class="text-center py-12 text-gray-500"
    >
      No {{ statusFilter.toLowerCase() }} submissions
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <UCard
        v-for="submission in submissions"
        :key="submission.id"
      >
        <div class="flex flex-col sm:flex-row sm:items-start gap-4">
          <div class="flex-1 min-w-0">
            <NuxtLink
              :to="`/events/${submission.slug}`"
              class="font-medium text-primary-600 hover:text-primary-700 truncate block"
            >
              {{ submission.title }}
            </NuxtLink>
            <div class="text-sm text-gray-600 mt-1">
              {{ formatDate(submission.startsAt) }}
            </div>
            <div class="text-xs text-gray-500 mt-0.5">
              By: {{ submission.submittedBy?.email || 'Unknown' }}
            </div>
          </div>

          <div
            v-if="statusFilter === 'PENDING'"
            class="flex items-center gap-2 flex-shrink-0"
          >
            <UButton
              color="success"
              variant="soft"
              size="xs"
              :loading="actioningId === submission.id"
              @click="handleAction(submission.id, 'approve')"
            >
              Approve
            </UButton>
            <UButton
              color="error"
              variant="soft"
              size="xs"
              :loading="actioningId === submission.id"
              @click="handleAction(submission.id, 'reject')"
            >
              Reject
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
