<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

type Town = { id: string; townKey: string; city: string; state: string; source: 'SEED' | 'LLM' | 'ADMIN' }
type Region = { id: string; name: string; slug: string; isActive: boolean; venueCount: number; towns: Town[] }

const toast = useToast()
const { data, refresh } = await useFetch<{ regions: Region[] }>('/api/admin/regions')
const regions = computed(() => data.value?.regions ?? [])
const regionItems = computed(() => regions.value.filter(r => r.slug !== 'other').map(r => ({ label: r.name, value: r.id })))
const savingId = ref<string | null>(null)

async function reassign(town: Town, regionId: string) {
  savingId.value = town.id
  try {
    const res = await $fetch<{ movedVenues: number }>(`/api/admin/region-towns/${town.id}`, { method: 'PATCH', body: { regionId } })
    toast.add({ title: `Moved ${town.city}`, description: `${res.movedVenues} venues moved`, color: 'success' })
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Could not move town', description: error.data?.message || 'Unknown error', color: 'error' })
    await refresh()
  } finally {
    savingId.value = null
  }
}

useSeoMeta({ title: 'Admin - Regions' })
</script>

<template>
  <div class="px-4 py-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">
      Regions
    </h1>
    <div class="space-y-4">
      <UCard
        v-for="region in regions"
        :key="region.id"
      >
        <template #header>
          <div class="flex items-center gap-2">
            <span class="font-semibold">{{ region.name }}</span>
            <span class="text-sm text-gray-500">{{ region.slug }}</span>
            <UBadge
              :color="region.isActive ? 'success' : 'neutral'"
              variant="soft"
              size="sm"
            >
              {{ region.isActive ? 'active' : 'inactive' }}
            </UBadge>
            <span class="ml-auto text-sm text-gray-500">{{ region.venueCount }} venues, {{ region.towns.length }} towns</span>
          </div>
        </template>
        <p
          v-if="!region.towns.length"
          class="text-sm text-gray-500"
        >
          No towns mapped.
        </p>
        <ul class="divide-y divide-gray-100">
          <li
            v-for="town in region.towns"
            :key="town.id"
            class="flex items-center gap-3 py-2"
          >
            <span class="flex-1">{{ town.city }}, {{ town.state }}</span>
            <span class="text-xs text-gray-400">{{ town.source }}</span>
            <USelect
              :model-value="region.id"
              :items="regionItems"
              :disabled="savingId === town.id"
              size="sm"
              class="w-56"
              @update:model-value="(id: string) => id !== region.id && reassign(town, id)"
            />
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
