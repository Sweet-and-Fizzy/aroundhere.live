<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

const toast = useToast()
const statusFilter = ref('OPEN')
const adminNote = ref('')
const actioningId = ref<string | null>(null)

const { data: response, refresh } = await useFetch('/api/admin/reports', {
  query: computed(() => ({ status: statusFilter.value })),
  watch: [statusFilter],
})

const reports = computed(() => response.value?.items as any[] || [])
const pagination = computed(() => response.value?.pagination)

const reasonLabels: Record<string, string> = {
  WRONG_DATE: 'Wrong date/time',
  WRONG_VENUE: 'Wrong venue',
  CANCELLED: 'Cancelled',
  DUPLICATE: 'Duplicate',
  SPAM: 'Spam',
  OTHER: 'Other',
}

async function updateReport(id: string, status: 'RESOLVED' | 'DISMISSED') {
  actioningId.value = id
  try {
    await $fetch(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      body: { status, adminNote: adminNote.value || undefined },
    })
    adminNote.value = ''
    toast.add({ title: `Report ${status.toLowerCase()}`, color: 'success' })
    refresh()
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to update report', color: 'error' })
  } finally {
    actioningId.value = null
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

useSeoMeta({ title: 'Admin - Reports' })
</script>

<template>
  <div class="px-4 py-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">
      Event Reports
    </h1>

    <!-- Status Filter -->
    <div class="flex gap-2 mb-6">
      <UButton
        v-for="status in ['OPEN', 'RESOLVED', 'DISMISSED']"
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
      v-if="reports.length === 0"
      class="text-center py-12 text-gray-500"
    >
      No {{ statusFilter.toLowerCase() }} reports
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <UCard
        v-for="report in reports"
        :key="report.id"
      >
        <div class="flex flex-col sm:flex-row sm:items-start gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <NuxtLink
                :to="`/events/${report.event.slug}`"
                class="font-medium text-primary-600 hover:text-primary-700 truncate"
              >
                {{ report.event.title }}
              </NuxtLink>
              <UBadge
                color="warning"
                variant="soft"
                size="sm"
              >
                {{ reasonLabels[report.reason] || report.reason }}
              </UBadge>
            </div>
            <p
              v-if="report.message"
              class="text-sm text-gray-600 mb-2"
            >
              {{ report.message }}
            </p>
            <div class="text-xs text-gray-500 flex gap-3">
              <span>{{ report.user?.email || 'Anonymous' }}</span>
              <span>{{ formatDate(report.createdAt) }}</span>
            </div>
          </div>

          <div
            v-if="statusFilter === 'OPEN'"
            class="flex items-center gap-2 flex-shrink-0"
          >
            <UButton
              color="success"
              variant="soft"
              size="xs"
              :loading="actioningId === report.id"
              @click="updateReport(report.id, 'RESOLVED')"
            >
              Resolve
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              size="xs"
              :loading="actioningId === report.id"
              @click="updateReport(report.id, 'DISMISSED')"
            >
              Dismiss
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
        Showing {{ reports.length }} of {{ pagination.total }}
      </p>
    </div>
  </div>
</template>
