<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

const toast = useToast()
const statusFilter = ref('PENDING')
const actioningId = ref<string | null>(null)

const { data: response, refresh } = await useFetch('/api/admin/submissions', {
  query: computed(() => ({ status: statusFilter.value })),
  watch: [statusFilter],
})

const submissions = computed(() => response.value?.items as any[] || [])
const pagination = computed(() => response.value?.pagination)

async function handleAction(id: string, action: 'approve' | 'reject' | 'revoke' | 'reopen') {
  actioningId.value = id
  try {
    await $fetch(`/api/admin/submissions/${id}`, {
      method: 'PATCH',
      body: { action },
    })
    const labels: Record<string, string> = { approve: 'approved', reject: 'rejected', revoke: 'revoked', reopen: 'reopened' }
    toast.add({ title: `Event ${labels[action]}`, color: 'success' })
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

useSeoMeta({ title: 'Admin - Submissions' })
</script>

<template>
  <div class="px-4 py-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">
      Event Submissions
    </h1>

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
            <div class="flex items-center gap-2 mb-1">
              <NuxtLink
                :to="`/events/${submission.slug}`"
                class="font-medium text-primary-600 hover:text-primary-700 truncate"
              >
                {{ submission.title }}
              </NuxtLink>
              <UBadge
                :color="submission.reviewStatus === 'PENDING' ? 'warning' : submission.reviewStatus === 'APPROVED' ? 'success' : 'error'"
                variant="soft"
                size="sm"
              >
                {{ submission.reviewStatus }}
              </UBadge>
            </div>
            <div class="text-sm text-gray-600 mb-1">
              <span v-if="submission.venue">{{ submission.venue.name }}</span>
              <span v-else-if="submission.locationName">{{ submission.locationName }}</span>
              <span class="mx-2">-</span>
              <span>{{ formatDate(submission.startsAt) }}</span>
            </div>
            <div class="text-xs text-gray-500 flex gap-3">
              <span>By: {{ submission.submittedBy?.email || 'Unknown' }}</span>
              <span>Submitted: {{ formatDate(submission.createdAt) }}</span>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <template v-if="statusFilter === 'PENDING'">
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
            </template>
            <UButton
              v-if="statusFilter === 'APPROVED'"
              color="warning"
              variant="soft"
              size="xs"
              :loading="actioningId === submission.id"
              @click="handleAction(submission.id, 'revoke')"
            >
              Revoke
            </UButton>
            <UButton
              v-if="statusFilter === 'REJECTED'"
              color="neutral"
              variant="soft"
              size="xs"
              :loading="actioningId === submission.id"
              @click="handleAction(submission.id, 'reopen')"
            >
              Reopen
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <div
      v-if="pagination && pagination.hasMore"
      class="mt-6 text-center"
    >
      <p class="text-sm text-gray-500">
        Showing {{ submissions.length }} of {{ pagination.total }}
      </p>
    </div>
  </div>
</template>
