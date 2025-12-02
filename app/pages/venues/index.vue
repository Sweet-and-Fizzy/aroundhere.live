<script setup lang="ts">
const { data: response } = await useFetch('/api/venues')

const allVenues = computed(() => response.value?.venues || [])

// Track which venues are visible on the map
const visibleVenueIds = ref<string[] | null>(null)

// Filter venues to only those visible on map (or all if map hasn't emitted yet)
const venues = computed(() => {
  if (visibleVenueIds.value === null) return allVenues.value
  return allVenues.value.filter(v => visibleVenueIds.value!.includes(v.id))
})

function onVisibleVenues(ids: string[]) {
  visibleVenueIds.value = ids
}

useSeoMeta({
  title: 'Venues - Local Music Listings',
  description: 'Browse music venues in Western Massachusetts. Find bars, clubs, theaters, and more hosting live music.',
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

    <main>
      <!-- Map -->
      <ClientOnly>
        <VenueMap
          v-if="allVenues.length > 0"
          :venues="allVenues"
          persist-key="mapBounds"
          @visible-venues="onVisibleVenues"
        />
      </ClientOnly>

      <!-- Showing count when filtered by map -->
      <p
        v-if="visibleVenueIds !== null && venues.length !== allVenues.length"
        class="text-sm text-gray-600 mb-4"
      >
        Showing {{ venues.length }} of {{ allVenues.length }} venues in view
      </p>

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

    <BackToTop />
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
  gap: 1rem;
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
  width: 100px;
  height: 100px;
  object-fit: contain;
  background: #1a1a1a;
  border-radius: 0.5rem;
  padding: 0.75rem;
  flex-shrink: 0;
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
