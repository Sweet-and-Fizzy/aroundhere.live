<script setup lang="ts">
const { events, loading, pagination, searchTotalCount, fetchEvents, searchEvents } = useEvents()

// Fetch venues and genres for filters
const { data: venuesData } = await useFetch('/api/venues')
const venues = computed(() => venuesData.value?.venues ?? [])

const { data: genresData } = await useFetch('/api/genres')
const genres = computed(() => genresData.value?.genres ?? [])
const genreLabels = computed(() => genresData.value?.genreLabels ?? {})

// Track current filters for pagination and facets
const currentFilters = ref<Record<string, any>>({})

// Ref to sidebar component for calling methods
const sidebarRef = ref<{ clearFiltersKeepSearch: () => void } | null>(null)

// Track if we're in search mode
const isSearching = computed(() => !!currentFilters.value.q)
const moreResultsOutsideFilters = computed(() => {
  if (!isSearching.value) return 0
  return searchTotalCount.value - events.value.length
})

// Fetch facet counts based on current filters (including search query)
const facetParams = computed(() => {
  const params: Record<string, string> = {}
  if (currentFilters.value.q) params.q = currentFilters.value.q
  if (currentFilters.value.startDate) params.startDate = currentFilters.value.startDate
  if (currentFilters.value.endDate) params.endDate = currentFilters.value.endDate
  if (currentFilters.value.venueIds?.length) params.venueIds = currentFilters.value.venueIds.join(',')
  if (currentFilters.value.genres?.length) params.genres = currentFilters.value.genres.join(',')
  if (currentFilters.value.eventTypes?.length) params.eventTypes = currentFilters.value.eventTypes.join(',')
  if (currentFilters.value.musicOnly !== undefined) params.musicOnly = String(currentFilters.value.musicOnly)
  return params
})

const { data: facetsData } = await useFetch('/api/events/facets', {
  params: facetParams,
  watch: [facetParams],
})
const facets = computed(() => facetsData.value ?? undefined)

async function handleFilter(filters: Record<string, any>) {
  currentFilters.value = filters
  if (filters.q) {
    await searchEvents(filters)
  } else {
    await fetchEvents(filters)
  }
}

// Clear filters and search again (for "search all events" hint)
function searchAllEvents() {
  // Call sidebar method to clear filters (which will trigger applyFilters and emit new filter event)
  sidebarRef.value?.clearFiltersKeepSearch()
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

    <!-- Two-column layout on lg+ screens -->
    <div class="lg:flex lg:gap-6">
      <!-- Sidebar Filters - Desktop only -->
      <aside class="hidden lg:block lg:w-72 flex-shrink-0">
        <div class="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-sm">
          <div class="px-4 py-3 border-b border-gray-200">
            <h2 class="font-semibold text-gray-900">Filters</h2>
          </div>
          <div class="p-4">
            <EventFiltersSidebar
              ref="sidebarRef"
              :venues="venues"
              :genres="genres"
              :genre-labels="genreLabels"
              :facets="facets"
              :result-count="events.length"
              @filter="handleFilter"
            />
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 min-w-0">
        <!-- Compact Filters - Mobile/Tablet only -->
        <div class="lg:hidden">
          <EventFilters
            :venues="venues"
            :genres="genres"
            :genre-labels="genreLabels"
            @filter="handleFilter"
          />
        </div>

        <!-- Results Header -->
        <div class="flex flex-col gap-1 mb-3 sm:mb-4 px-1">
          <div class="flex justify-between items-center">
            <h2 class="text-sm sm:text-lg font-semibold text-gray-700">
              <span v-if="loading">Loading...</span>
              <span v-else-if="isSearching">
                {{ events.length }} result{{ events.length !== 1 ? 's' : '' }} for "{{ currentFilters.q }}"
              </span>
              <span v-else>
                {{ events.length }} of {{ pagination.total }} events
              </span>
            </h2>
          </div>
          <!-- Hint when no results but there are results without filters -->
          <div
            v-if="isSearching && events.length === 0 && searchTotalCount > 0 && !loading"
            class="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md"
          >
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
            <span>No results with current filters, but {{ searchTotalCount }} found in all events.</span>
            <button
              class="font-medium underline"
              @click="searchAllEvents"
            >
              Clear filters
            </button>
          </div>
          <!-- Hint when there ARE results but more exist outside filters -->
          <div
            v-else-if="isSearching && moreResultsOutsideFilters > 0 && !loading"
            class="flex items-center gap-2 text-sm text-gray-500"
          >
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4" />
            <span>{{ moreResultsOutsideFilters }} more result{{ moreResultsOutsideFilters !== 1 ? 's' : '' }} outside current filters</span>
            <button
              class="text-primary-600 hover:text-primary-700 font-medium underline"
              @click="searchAllEvents"
            >
              Search all events
            </button>
          </div>
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
      </main>
    </div>

    <BackToTop />
  </div>
</template>

