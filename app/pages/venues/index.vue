<script setup lang="ts">
const { data: response } = await useFetch('/api/venues')

const allVenues = computed(() => response.value?.venues || [])

// Track which venues are visible on the map
const visibleVenueIds = ref<string[] | null>(null)

// Track sidebar filters
const sidebarFilters = ref<Record<string, any>>({})

// Track active sidebar tab for dynamic width
const sidebarTab = ref<'filters' | 'chat'>('filters')

function handleTabChange(tab: 'filters' | 'chat') {
  sidebarTab.value = tab
}

// Filter venues based on both map visibility and sidebar filters
const venues = computed(() => {
  let filtered = allVenues.value

  // Apply map filtering
  if (visibleVenueIds.value !== null) {
    filtered = filtered.filter(v => visibleVenueIds.value!.includes(v.id))
  }

  // Apply sidebar filters
  if (sidebarFilters.value.venueTypes?.length > 0) {
    filtered = filtered.filter(v => sidebarFilters.value.venueTypes.includes(v.venueType))
  }

  if (sidebarFilters.value.cities?.length > 0) {
    filtered = filtered.filter(v => v.city && sidebarFilters.value.cities.includes(v.city))
  }

  if (sidebarFilters.value.hasEvents) {
    filtered = filtered.filter(v => (v._count?.events || 0) > 0)
  }

  if (sidebarFilters.value.verified) {
    filtered = filtered.filter(v => v.verified)
  }

  if (sidebarFilters.value.searchQuery) {
    const query = sidebarFilters.value.searchQuery.toLowerCase()
    filtered = filtered.filter(v => v.name.toLowerCase().includes(query))
  }

  return filtered
})

function onVisibleVenues(ids: string[]) {
  visibleVenueIds.value = ids
}

function handleFilter(filters: Record<string, any>) {
  sidebarFilters.value = filters
}

const config = useRuntimeConfig()
const canonicalUrl = `${config.public.siteUrl}/venues`
const { regionName, updateRegion } = useCurrentRegion()

// Handle map center changes to update region
function onCenterChanged(center: { lat: number; lng: number; radius: number | 'view' }) {
  updateRegion(center.lat, center.lng)
}

useSeoMeta({
  title: 'Venues - AroundHere',
  description: () => `Browse music venues in ${regionName.value}. Find bars, clubs, theaters, and more hosting live music.`,
  // Open Graph (no region for sharing)
  ogTitle: 'Local Venues - AroundHere',
  ogDescription: 'Explore venues near you. Find bars, clubs, theaters, and concert halls hosting live music and entertainment.',
  ogUrl: canonicalUrl,
  ogType: 'website',
  ogImage: `${config.public.siteUrl}/og-image-venues.png`,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  // Twitter
  twitterCard: 'summary_large_image',
  twitterTitle: 'Local Venues - AroundHere',
  twitterDescription: 'Explore venues near you hosting live music and entertainment.',
  twitterImage: `${config.public.siteUrl}/og-image-venues.png`,
})

useHead({
  link: [
    { rel: 'canonical', href: canonicalUrl },
  ],
})
</script>

<template>
  <div class="px-2 sm:px-0">
    <!-- Hero Header -->
    <div
      class="text-white py-6 px-4 sm:py-10 sm:px-6 rounded-lg sm:rounded-xl mb-4 sm:mb-8"
      style="background: radial-gradient(ellipse at center, #374151 0%, #1f2937 60%, #111827 100%);"
    >
      <div class="text-center">
        <h1 class="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
          Venues
        </h1>
        <p class="text-sm sm:text-lg text-white/90">
          {{ allVenues.length }} venue{{ allVenues.length === 1 ? '' : 's' }} with live music
        </p>
      </div>
    </div>

    <!-- Map - Full Width -->
    <div class="mb-6">
      <ClientOnly>
        <VenueMap
          v-if="allVenues.length > 0"
          :venues="allVenues"
          persist-key="mapBounds"
          :show-controls="true"
          @visible-venues="onVisibleVenues"
          @center-changed="onCenterChanged"
        />
      </ClientOnly>
    </div>

    <!-- Filters Count / Status -->
    <div class="mb-4">
      <p class="text-sm text-gray-600">
        Showing {{ venues.length }} of {{ allVenues.length }} venues
      </p>
    </div>

    <!-- Two-column layout: Sidebar + Venue List -->
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
          <VenueSidebarTabs
            :venues="allVenues"
            @filter="handleFilter"
            @tab-change="handleTabChange"
          />
        </div>
      </aside>

      <!-- Venue List -->
      <main class="flex-1 min-w-0">
        <div
          v-if="venues.length === 0"
          class="empty"
        >
          No venues found.
        </div>

        <ul
          v-else
          class="venue-list"
        >
          <li
            v-for="venue in venues"
            :key="venue.id"
            class="venue-item"
          >
            <NuxtLink
              :to="`/venues/${venue.slug}`"
              class="venue-link"
            >
              <div class="venue-content">
                <img
                  v-if="venue.logoUrl"
                  :src="venue.logoUrl"
                  :alt="`${venue.name} logo`"
                  class="venue-logo"
                >
                <div class="venue-info">
                  <h2 class="venue-name">
                    {{ venue.name }}
                  </h2>
                  <p
                    v-if="venue.city"
                    class="venue-location"
                  >
                    {{ venue.city }}<template v-if="venue.region">
                      , {{ venue.region.name }}
                    </template>
                  </p>
                  <p class="venue-type">
                    {{ venue.venueType.replace('_', ' ') }}
                  </p>
                  <p
                    v-if="venue._count?.events"
                    class="venue-events"
                  >
                    {{ venue._count.events }} upcoming event{{ venue._count.events === 1 ? '' : 's' }}
                  </p>
                </div>
              </div>
            </NuxtLink>
          </li>
        </ul>
      </main>
    </div>

    <BackToTop />

    <!-- Floating Chat Button - Mobile/Tablet only -->
    <FloatingChatButton />
  </div>
</template>

<style scoped>
.empty {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted, #666);
}

.venue-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

@media (max-width: 1024px) {
  .venue-list {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 900px) {
  .venue-list {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .venue-list {
    grid-template-columns: 1fr;
  }
}

.venue-item {
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 0.5rem;
  overflow: hidden;
}

.venue-link {
  display: block;
  padding: 1rem;
  text-decoration: none;
  color: inherit;
}

.venue-link:hover {
  background: var(--bg-muted, #f5f5f5);
}

.venue-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.venue-logo {
  width: 140px;
  height: 140px;
  object-fit: contain;
  background: #1a1a1a;
  border-radius: 0.5rem;
  padding: 1rem;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .venue-logo {
    width: 100px;
    height: 100px;
    padding: 0.75rem;
  }
}

.venue-info {
  flex: 1;
  min-width: 0;
}

.venue-name {
  margin: 0 0 0.25rem;
  font-size: 1.125rem;
}

.venue-location,
.venue-type,
.venue-events {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted, #666);
}

.venue-events {
  margin-top: 0.5rem;
  color: var(--primary-color, #3b82f6);
}
</style>
