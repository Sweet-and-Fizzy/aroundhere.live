<script setup lang="ts">
const { data, status } = await useFetch('/api/user/submissions')

const submissions = computed(() => (data.value as any)?.items || [])

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusColor(reviewStatus: string) {
  if (reviewStatus === 'APPROVED') return 'success'
  if (reviewStatus === 'REJECTED') return 'error'
  return 'warning'
}

function venueName(submission: any) {
  return submission.venue?.name || submission.locationName || null
}
</script>

<template>
  <div>
    <div
      v-if="status === 'pending'"
      class="flex justify-center py-4"
    >
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-5 h-5 animate-spin text-gray-400"
      />
    </div>

    <div
      v-else-if="submissions.length === 0"
      class="text-sm text-gray-500 py-2"
    >
      No submissions yet.
      <NuxtLink
        to="/events/submit"
        class="text-primary-600 hover:text-primary-700"
      >
        Submit an event
      </NuxtLink>
    </div>

    <div
      v-else
      class="divide-y divide-gray-100"
    >
      <div
        v-for="submission in submissions"
        :key="submission.id"
        class="flex items-center justify-between gap-3 py-3"
      >
        <div class="min-w-0 flex-1">
          <NuxtLink
            v-if="submission.reviewStatus === 'APPROVED'"
            :to="`/events/${submission.slug}`"
            class="text-sm font-medium text-primary-600 hover:text-primary-700 truncate block"
          >
            {{ submission.title }}
          </NuxtLink>
          <span
            v-else
            class="text-sm font-medium text-gray-900 truncate block"
          >
            {{ submission.title }}
          </span>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-xs text-gray-500">{{ formatDate(submission.startsAt) }}</span>
            <span
              v-if="venueName(submission)"
              class="text-xs text-gray-400"
            >
              &middot; {{ venueName(submission) }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <!-- Edit button for pending and approved submissions -->
          <UButton
            v-if="submission.reviewStatus !== 'REJECTED'"
            icon="i-heroicons-pencil-square"
            color="neutral"
            variant="ghost"
            size="xs"
            :to="`/events/submit?edit=${submission.id}`"
            title="Edit event"
          />
          <!-- View button for approved submissions -->
          <UButton
            v-if="submission.reviewStatus === 'APPROVED'"
            icon="i-heroicons-eye"
            color="neutral"
            variant="ghost"
            size="xs"
            :to="`/events/${submission.slug}`"
            title="View event"
          />
          <UBadge
            :color="statusColor(submission.reviewStatus)"
            variant="soft"
            size="sm"
          >
            {{ submission.reviewStatus.charAt(0) + submission.reviewStatus.slice(1).toLowerCase() }}
          </UBadge>
        </div>
      </div>
    </div>
  </div>
</template>
