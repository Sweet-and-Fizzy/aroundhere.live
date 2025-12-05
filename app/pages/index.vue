<script setup lang="ts">
const { events, loading, pagination, fetchEvents, searchEvents } = useEvents()

// Fetch venues and genres for filters
const { data: venuesData } = await useFetch('/api/venues')
const venues = computed(() => venuesData.value?.venues ?? [])

const { data: genresData } = await useFetch('/api/genres')
const genres = computed(() => genresData.value?.genres ?? [])
const genreLabels = computed(() => genresData.value?.genreLabels ?? {})

// Track current filters for pagination
const currentFilters = ref<Record<string, any>>({})

async function handleFilter(filters: Record<string, any>) {
  currentFilters.value = filters
  if (filters.q) {
    await searchEvents(filters)
  } else {
    await fetchEvents(filters)
  }
}

async function loadMore() {
  const newOffset = pagination.value.offset + pagination.value.limit
  await fetchEvents({
    ...currentFilters.value,
    offset: newOffset,
  }, true)
}

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

useSeoMeta({
  title: 'AroundHere - Western MA Live Shows',
  description: 'Find live music events, concerts, and shows in Western Massachusetts. Browse upcoming shows at Iron Horse, The Drake, and more.',
  // Open Graph
  ogTitle: 'AroundHere - Live Music in Western Massachusetts',
  ogDescription: 'Discover live music events, concerts, and shows in Western Massachusetts. Browse upcoming shows at local venues.',
  ogUrl: siteUrl,
  // Twitter
  twitterTitle: 'AroundHere - Live Music in Western Massachusetts',
  twitterDescription: 'Discover live music events, concerts, and shows in Western Massachusetts.',
})

useHead({
  link: [
    { rel: 'canonical', href: siteUrl },
  ],
})
</script>

<template>
  <div class="px-2 sm:px-0">
    <!-- Hero Section - Smaller on mobile -->
    <div
      class="text-white py-6 px-4 sm:py-10 sm:px-6 rounded-lg sm:rounded-xl mb-4 sm:mb-8"
      style="background: radial-gradient(ellipse at center, #374151 0%, #1f2937 60%, #111827 100%);"
    >
      <div class="text-center">
        <h1 class="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
          AroundHere
        </h1>
        <p class="text-sm sm:text-lg text-white/90">
          Discover live shows in Western Massachusetts
        </p>
      </div>
    </div>

    <!-- Filters -->
    <EventFilters
      :venues="venues"
      :genres="genres"
      :genre-labels="genreLabels"
      @filter="handleFilter"
    />

    <!-- Results Header -->
    <div class="flex justify-between items-center mb-3 sm:mb-4 px-1">
      <h2 class="text-sm sm:text-lg font-semibold text-gray-700">
        <span v-if="loading">Loading...</span>
        <span v-else>
          {{ events.length }} of {{ pagination.total }} events
        </span>
      </h2>
    </div>

    <!-- Event List -->
    <EventList
      :events="events"
      :loading="loading"
    />

    <!-- Load More / Pagination -->
    <div
      v-if="pagination.hasMore && !loading"
      class="mt-4 sm:mt-6 text-center pb-4"
    >
      <UButton
        color="primary"
        variant="soft"
        size="md"
        class="w-full sm:w-auto"
        @click="loadMore"
      >
        Load More Events
      </UButton>
      <p class="text-xs sm:text-sm text-gray-500 mt-2">
        Showing {{ events.length }} of {{ pagination.total }} events
      </p>
    </div>

    <BackToTop />
  </div>
</template>

