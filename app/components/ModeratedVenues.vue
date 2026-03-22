<script setup lang="ts">
const { data, status } = await useFetch('/api/user/moderated-venues')

const venues = computed(() => (data.value as any)?.items || [])
</script>

<template>
  <UCard v-if="status !== 'pending' && venues.length > 0">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon
          name="i-heroicons-shield-check"
          class="w-5 h-5 text-primary-500"
        />
        <span class="font-semibold">Moderated Venues</span>
      </div>
    </template>

    <div class="space-y-2">
      <div
        v-for="item in venues"
        :key="item.id"
        class="flex items-center justify-between gap-2 py-1.5"
      >
        <div class="min-w-0 flex-1">
          <NuxtLink
            :to="`/venues/${item.venue.slug}`"
            class="text-sm font-medium text-primary-600 hover:text-primary-700 truncate block"
          >
            {{ item.venue.name }}
          </NuxtLink>
          <span class="text-xs text-gray-500">{{ item.role }}</span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <UBadge
            v-if="item.pendingCount > 0"
            color="warning"
            variant="soft"
            size="sm"
          >
            {{ item.pendingCount }} pending
          </UBadge>
          <UButton
            :to="`/venues/${item.venue.slug}/moderate`"
            size="xs"
            color="primary"
            variant="soft"
          >
            Moderate
          </UButton>
        </div>
      </div>
    </div>
  </UCard>
</template>
