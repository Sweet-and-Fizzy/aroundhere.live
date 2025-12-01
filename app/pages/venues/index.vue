<script setup lang="ts">
const { data: response } = await useFetch('/api/venues')

const venues = computed(() => response.value?.venues || [])
const showMap = ref(true)

useSeoMeta({
  title: 'Venues - Local Music Listings',
  description: 'Browse music venues in Western Massachusetts. Find bars, clubs, theaters, and more hosting live music.',
})
</script>

<template>
  <div class="venues-page">
    <header class="page-header">
      <h1>Venues</h1>
      <p class="tagline">
        Music venues in Western Massachusetts
      </p>
    </header>

    <main class="page-content">
      <!-- Map Toggle and Map -->
      <div
        v-if="venues.length > 0"
        class="map-section"
      >
        <button
          class="map-toggle"
          @click="showMap = !showMap"
        >
          {{ showMap ? 'Hide Map' : 'Show Map' }}
        </button>
        <ClientOnly>
          <VenueMap
            v-if="showMap"
            :venues="venues"
          />
        </ClientOnly>
      </div>

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
</template>

<style scoped>
.venues-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  margin: 0 0 0.25rem;
}

.tagline {
  color: var(--text-muted, #666);
  margin: 0;
}

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

.map-section {
  margin-bottom: 1.5rem;
}

.map-toggle {
  background: var(--primary-color, #3b82f6);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.map-toggle:hover {
  background: var(--primary-hover, #2563eb);
}
</style>
