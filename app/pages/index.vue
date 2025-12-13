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

// Ref to sidebar component for calling methods (desktop)
const sidebarRef = ref<{
  clearFiltersKeepSearch: () => void
  openChatWithMessage: (message: string) => void
} | null>(null)

// Ref to floating chat button for calling methods (mobile/tablet)
const floatingChatRef = ref<{
  openWithMessage: (message: string) => void
} | null>(null)

// Hero chat input
const heroChatInput = ref('')
const heroSuggestions = [
  { icon: '⭐', text: "What's happening this weekend?" },
  { icon: '🎵', text: 'When can I hear Jazz?' },
  { icon: '💃', text: 'Where can I go dancing?' },
]

function submitHeroChat(messageOrEvent?: string | Event) {
  const query = typeof messageOrEvent === 'string' ? messageOrEvent : heroChatInput.value.trim()
  if (!query) return

  // Check if we're on desktop (lg breakpoint = 1024px) or mobile/tablet
  const isDesktop = window.innerWidth >= 1024

  if (isDesktop) {
    // Open the chat sidebar on desktop
    sidebarRef.value?.openChatWithMessage(query)
  } else {
    // Open the floating chat drawer on mobile/tablet
    floatingChatRef.value?.openWithMessage(query)
  }

  heroChatInput.value = ''
}

// Track active sidebar tab for dynamic width
const sidebarTab = ref<'filters' | 'chat'>('filters')

function handleTabChange(tab: 'filters' | 'chat') {
  sidebarTab.value = tab
}

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
const { regionName } = useCurrentRegion()

useSeoMeta({
  title: 'AroundHere - Live Shows',
  description: () => `Find live music events, concerts, and shows in ${regionName.value}. Browse upcoming shows at local venues.`,
  // Open Graph
  ogTitle: () => `AroundHere - Live Music in ${regionName.value}`,
  ogDescription: () => `Discover live music events, concerts, and shows in ${regionName.value}. Browse upcoming shows at local venues.`,
  ogUrl: siteUrl,
  // Twitter
  twitterTitle: () => `AroundHere - Live Music in ${regionName.value}`,
  twitterDescription: () => `Discover live music events, concerts, and shows in ${regionName.value}.`,
})

useHead({
  link: [
    { rel: 'canonical', href: siteUrl },
  ],
})
</script>

<template>
  <div class="px-2 sm:px-0">
    <!-- Hero Section -->
    <div
      class="text-white py-6 px-4 sm:py-8 sm:px-6 rounded-lg sm:rounded-xl mb-4 sm:mb-8"
      style="background: radial-gradient(ellipse at center, #374151 0%, #1f2937 60%, #111827 100%);"
    >
      <div class="flex flex-col md:flex-row items-center gap-4 md:gap-8">
        <!-- Logo -->
        <div class="flex-shrink-0 mx-auto md:mx-0">
          <AnimatedLogo :playing="true" class="w-40 md:w-56" />
        </div>

        <!-- Chat Input Section -->
        <div class="flex-1 w-full">
          <h2 class="text-lg md:text-xl font-semibold mb-3 text-center md:text-left">
            Ask me about local events
          </h2>

          <!-- Input Form -->
          <form class="flex gap-2 mb-3" @submit.prevent="submitHeroChat">
            <div class="flex-1 relative">
              <input
                v-model="heroChatInput"
                type="text"
                placeholder="Type your question here"
                class="hero-chat-input w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
            </div>
            <button
              type="submit"
              class="px-4 py-3 bg-green-500 hover:bg-green-600 rounded-lg transition-colors flex items-center justify-center"
              :disabled="!heroChatInput.trim()"
            >
              <UIcon name="i-heroicons-arrow-right" class="w-5 h-5 text-white" />
            </button>
          </form>

          <!-- Suggestion Chips -->
          <div class="flex flex-wrap gap-2 justify-center md:justify-start">
            <button
              v-for="suggestion in heroSuggestions"
              :key="suggestion.text"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-gray-600 rounded-full text-sm text-gray-300 hover:bg-gray-800 hover:border-gray-500 transition-colors"
              @click="submitHeroChat(suggestion.text)"
            >
              <span>{{ suggestion.icon }}</span>
              {{ suggestion.text }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Two-column layout on lg+ screens -->
    <div class="lg:flex lg:gap-6">
      <!-- Sidebar with Tabs - Desktop only -->
      <aside
        class="hidden lg:block flex-shrink-0 transition-all duration-300 ease-in-out"
        :class="sidebarTab === 'chat' ? 'lg:w-[28rem]' : 'lg:w-72'"
      >
        <div
          class="sticky top-4 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden flex flex-col"
          :class="sidebarTab === 'chat' ? 'h-[calc(100vh-6rem)]' : ''"
        >
          <SidebarTabs
            ref="sidebarRef"
            :venues="venues"
            :genres="genres"
            :genre-labels="genreLabels"
            :facets="facets"
            :result-count="events.length"
            @filter="handleFilter"
            @tab-change="handleTabChange"
          />
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

    <!-- Floating Chat Button - Mobile/Tablet only (hidden on desktop) -->
    <FloatingChatButton ref="floatingChatRef" />
  </div>
</template>

<style>
/* Override global input styles for hero chat input */
.hero-chat-input {
  color: white !important;
  caret-color: white;
}

.hero-chat-input::placeholder {
  color: #9ca3af !important;
}
</style>
