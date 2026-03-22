<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

const toast = useToast()
const statusFilter = ref('pending')
const actioningId = ref<string | null>(null)

const { data: response, refresh } = await useFetch('/api/admin/venue-claims', {
  query: computed(() => ({ status: statusFilter.value })),
  watch: [statusFilter],
})

const claims = computed(() => (response.value as any)?.items || [])
const pagination = computed(() => (response.value as any)?.pagination)

async function handleAction(id: string, action: 'approve' | 'reject') {
  actioningId.value = id
  try {
    await $fetch(`/api/admin/venue-claims/${id}`, {
      method: 'PATCH',
      body: { action },
    })
    toast.add({ title: `Claim ${action}d`, color: 'success' })
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

useSeoMeta({ title: 'Admin - Venue Claims' })
</script>

<template>
  <div class="px-4 py-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">
      Venue Claims
    </h1>

    <!-- Status Filter -->
    <div class="flex gap-2 mb-6">
      <UButton
        v-for="status in ['pending', 'approved', 'rejected']"
        :key="status"
        :color="statusFilter === status ? 'primary' : 'neutral'"
        :variant="statusFilter === status ? 'solid' : 'outline'"
        size="sm"
        @click="statusFilter = status"
      >
        {{ status.charAt(0).toUpperCase() + status.slice(1) }}
      </UButton>
    </div>

    <div
      v-if="claims.length === 0"
      class="text-center py-12 text-gray-500"
    >
      No {{ statusFilter }} claims
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <UCard
        v-for="claim in claims"
        :key="claim.id"
      >
        <div class="flex flex-col sm:flex-row sm:items-start gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <NuxtLink
                :to="`/venues/${claim.venue.slug}`"
                class="font-medium text-primary-600 hover:text-primary-700 truncate"
              >
                {{ claim.venue.name }}
              </NuxtLink>
              <UBadge
                color="info"
                variant="soft"
                size="sm"
              >
                {{ claim.role }}
              </UBadge>
            </div>
            <div class="text-sm text-gray-600 mb-1">
              {{ claim.user?.email || 'Unknown' }}
              <span v-if="claim.user?.displayName"> ({{ claim.user.displayName }})</span>
            </div>
            <p
              v-if="claim.contactInfo"
              class="text-sm text-gray-600 mt-1"
            >
              {{ claim.contactInfo }}
            </p>
            <div class="text-xs text-gray-500 mt-1">
              Submitted: {{ formatDate(claim.createdAt) }}
            </div>
          </div>

          <div
            v-if="statusFilter === 'pending'"
            class="flex items-center gap-2 flex-shrink-0"
          >
            <UButton
              color="success"
              variant="soft"
              size="xs"
              :loading="actioningId === claim.id"
              @click="handleAction(claim.id, 'approve')"
            >
              Approve
            </UButton>
            <UButton
              color="error"
              variant="soft"
              size="xs"
              :loading="actioningId === claim.id"
              @click="handleAction(claim.id, 'reject')"
            >
              Reject
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
        Showing {{ claims.length }} of {{ pagination.total }}
      </p>
    </div>
  </div>
</template>
