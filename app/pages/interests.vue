<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
})

const { favorites, loading, toggleArtist, toggleVenue, toggleGenre, toggleEventType } = useFavorites()
const { genreLabels } = useGenreLabels()
const { eventTypeLabels } = useEventTypeLabels()

// Check if user has any favorites
const hasFavorites = computed(() => {
  return favorites.value.artists.length > 0 ||
    favorites.value.venues.length > 0 ||
    favorites.value.genres.length > 0 ||
    favorites.value.eventTypes.length > 0
})

// Artist search
const artistSearchQuery = ref('')
const artistSearchResults = ref<Array<{ id: string; name: string; slug: string; genres: string[]; eventCount: number }>>([])
const artistSearchLoading = ref(false)
const showArtistResults = ref(false)

async function searchArtists() {
  if (artistSearchQuery.value.length < 2) {
    artistSearchResults.value = []
    return
  }

  artistSearchLoading.value = true
  try {
    const data = await $fetch('/api/artists/search', {
      query: { q: artistSearchQuery.value, limit: 8 },
    })
    // Filter out already favorited artists
    artistSearchResults.value = data.artists.filter(
      (a: { id: string }) => !favorites.value.artists.some(f => f.id === a.id)
    )
  } catch (e) {
    console.error('Artist search failed:', e)
    artistSearchResults.value = []
  } finally {
    artistSearchLoading.value = false
  }
}

async function addArtist(artist: { id: string; name: string; slug: string }) {
  await toggleArtist(artist)
  artistSearchQuery.value = ''
  artistSearchResults.value = []
  showArtistResults.value = false
}

// Venue search
const venueSearchQuery = ref('')
const venueSearchResults = ref<Array<{ id: string; name: string; slug: string; city: string | null; upcomingEventCount: number }>>([])
const venueSearchLoading = ref(false)
const showVenueResults = ref(false)

async function searchVenues() {
  if (venueSearchQuery.value.length < 2) {
    venueSearchResults.value = []
    return
  }

  venueSearchLoading.value = true
  try {
    const data = await $fetch('/api/venues/search', {
      query: { q: venueSearchQuery.value, limit: 8 },
    })
    // Filter out already favorited venues
    venueSearchResults.value = data.venues.filter(
      (v: { id: string }) => !favorites.value.venues.some(f => f.id === v.id)
    )
  } catch (e) {
    console.error('Venue search failed:', e)
    venueSearchResults.value = []
  } finally {
    venueSearchLoading.value = false
  }
}

async function addVenue(venue: { id: string; name: string; slug: string }) {
  await toggleVenue(venue)
  venueSearchQuery.value = ''
  venueSearchResults.value = []
  showVenueResults.value = false
}

// Debounced search
let artistSearchTimeout: ReturnType<typeof setTimeout> | null = null
function debouncedArtistSearch() {
  if (artistSearchTimeout) clearTimeout(artistSearchTimeout)
  artistSearchTimeout = setTimeout(searchArtists, 300)
}

let venueSearchTimeout: ReturnType<typeof setTimeout> | null = null
function debouncedVenueSearch() {
  if (venueSearchTimeout) clearTimeout(venueSearchTimeout)
  venueSearchTimeout = setTimeout(searchVenues, 300)
}

// All available genres for selection, sorted alphabetically
const allGenres = computed(() => {
  return Object.entries(genreLabels)
    .map(([slug, label]) => ({
      slug,
      label: label as string,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

// All available event types for selection, sorted alphabetically
// Exclude PRIVATE and OTHER as they're not really user preferences
const allEventTypes = computed(() => {
  return Object.entries(eventTypeLabels)
    .filter(([slug]) => !['PRIVATE', 'OTHER'].includes(slug))
    .map(([slug, label]) => ({
      slug,
      label: label as string,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

// Interest description
const interestDescription = ref('')
const originalInterestDescription = ref('')
const savingInterest = ref(false)

// Load interest description on mount
onMounted(async () => {
  try {
    const data = await $fetch('/api/user/preferences')
    interestDescription.value = data.interestDescription || ''
    originalInterestDescription.value = data.interestDescription || ''
  } catch (e) {
    console.error('Failed to load preferences:', e)
  }
})

async function saveInterestDescription() {
  // Only save if changed
  if (interestDescription.value === originalInterestDescription.value) return

  savingInterest.value = true
  try {
    await $fetch('/api/user/preferences', {
      method: 'PUT',
      body: { interestDescription: interestDescription.value.trim() },
    })
    originalInterestDescription.value = interestDescription.value.trim()
  } catch (e) {
    console.error('Failed to save interest description:', e)
  } finally {
    savingInterest.value = false
  }
}

async function removeArtist(artist: { id: string; name: string; slug: string }) {
  await toggleArtist(artist)
}

async function removeVenue(venue: { id: string; name: string; slug: string }) {
  await toggleVenue(venue)
}

async function handleGenreToggle(genreSlug: string) {
  await toggleGenre(genreSlug)
}

function isGenreFavorited(slug: string): boolean {
  return favorites.value.genres.includes(slug)
}

function isEventTypeFavorited(slug: string): boolean {
  return favorites.value.eventTypes.includes(slug)
}

async function handleEventTypeToggle(eventTypeSlug: string) {
  await toggleEventType(eventTypeSlug)
}

useSeoMeta({
  title: 'My Interests',
  description: 'Tell us what you like to get personalized recommendations',
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-8">
      My Interests
    </h1>

    <!-- Loading Skeletons -->
    <div
      v-if="loading"
      class="space-y-8"
    >
      <!-- Describe Your Interests Skeleton -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <USkeleton class="w-5 h-5 rounded" />
            <USkeleton class="h-5 w-40" />
          </div>
        </template>
        <USkeleton class="h-4 w-3/4 mb-2" />
        <USkeleton class="h-16 w-full rounded-lg" />
      </UCard>

      <!-- Event Types Skeleton -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <USkeleton class="w-5 h-5 rounded" />
            <USkeleton class="h-5 w-28" />
          </div>
        </template>
        <div class="flex flex-wrap gap-2">
          <USkeleton
            v-for="i in 6"
            :key="i"
            class="h-8 w-20 rounded-full"
          />
        </div>
      </UCard>

      <!-- Genres Skeleton -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <USkeleton class="w-5 h-5 rounded" />
            <USkeleton class="h-5 w-20" />
          </div>
        </template>
        <div class="flex flex-wrap gap-2">
          <USkeleton
            v-for="i in 12"
            :key="i"
            class="h-8 w-16 rounded-full"
          />
        </div>
      </UCard>

      <!-- Artists Skeleton -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <USkeleton class="w-5 h-5 rounded" />
              <USkeleton class="h-5 w-16" />
            </div>
            <USkeleton class="h-8 w-40 rounded-lg" />
          </div>
        </template>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <USkeleton
            v-for="i in 4"
            :key="i"
            class="h-10 rounded-lg"
          />
        </div>
      </UCard>

      <!-- Venues Skeleton -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <USkeleton class="w-5 h-5 rounded" />
              <USkeleton class="h-5 w-20" />
            </div>
            <USkeleton class="h-8 w-40 rounded-lg" />
          </div>
        </template>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <USkeleton
            v-for="i in 4"
            :key="i"
            class="h-10 rounded-lg"
          />
        </div>
      </UCard>
    </div>

    <div
      v-else
      class="space-y-8"
    >
      <!-- Onboarding banner for users with no favorites -->
      <div
        v-if="!hasFavorites"
        class="bg-gradient-to-br from-primary-50 to-blue-50 border border-primary-200 rounded-xl p-6"
      >
        <h2 class="text-xl font-semibold text-gray-900 mb-2">
          Get Started
        </h2>
        <p class="text-gray-600">
          Tell us what you're into below. You can also favorite artists and venues as you browse events.
        </p>
      </div>

      <!-- Info banner (only shown when user has favorites) -->
      <div
        v-if="hasFavorites"
        class="bg-primary-50 border border-primary-200 rounded-lg p-4"
      >
        <p class="text-sm text-primary-800">
          Your interests personalize your experience and power our recommendations.
          Get alerts when your favorite artists have shows, plus weekly picks tailored to your taste.
          <NuxtLink
            to="/how-it-works"
            class="font-medium underline"
          >
            Learn more
          </NuxtLink> · <NuxtLink
            to="/settings"
            class="font-medium underline"
          >
            Manage notifications
          </NuxtLink>
        </p>
      </div>

      <!-- Describe Your Interests -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-sparkles"
              class="w-5 h-5 text-primary-500"
            />
            <span class="font-semibold">Describe Your Interests</span>
          </div>
        </template>

        <div class="space-y-2">
          <p class="text-sm text-gray-600">
            Tell us what you're into to help us curate your weekly recommendations.
          </p>
          <div @focusout="saveInterestDescription">
            <textarea
              v-model="interestDescription"
              rows="2"
              maxlength="500"
              placeholder="e.g., I love indie rock and folk music. Jazz is growing on me lately."
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-400">
              {{ interestDescription.length }}/500
            </span>
            <span
              v-if="savingInterest"
              class="text-xs text-gray-500"
            >
              Saving...
            </span>
          </div>
        </div>
      </UCard>

      <!-- Event Types -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-calendar"
              class="w-5 h-5 text-primary-500"
            />
            <span class="font-semibold">Event Types</span>
            <UBadge
              v-if="favorites.eventTypes.length"
              color="primary"
              variant="soft"
              size="sm"
            >
              {{ favorites.eventTypes.length }}
            </UBadge>
          </div>
        </template>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="eventType in allEventTypes"
            :key="eventType.slug"
            type="button"
            :class="[
              'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
              isEventTypeFavorited(eventType.slug)
                ? 'bg-primary-500 text-white ring-2 ring-primary-500 ring-offset-2'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
            @click="handleEventTypeToggle(eventType.slug)"
          >
            {{ eventType.label }}
          </button>
        </div>
      </UCard>

      <!-- Genres -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-musical-note"
              class="w-5 h-5 text-primary-500"
            />
            <span class="font-semibold">Genres</span>
            <UBadge
              v-if="favorites.genres.length"
              color="primary"
              variant="soft"
              size="sm"
            >
              {{ favorites.genres.length }}
            </UBadge>
          </div>
        </template>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="genre in allGenres"
            :key="genre.slug"
            type="button"
            :class="[
              'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
              isGenreFavorited(genre.slug)
                ? 'bg-primary-500 text-white ring-2 ring-primary-500 ring-offset-2'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
            @click="handleGenreToggle(genre.slug)"
          >
            {{ genre.label }}
          </button>
        </div>
      </UCard>

      <!-- Favorite Artists -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-user-group"
                class="w-5 h-5 text-primary-500"
              />
              <span class="font-semibold">Artists</span>
              <UBadge
                v-if="favorites.artists.length"
                color="primary"
                variant="soft"
                size="sm"
              >
                {{ favorites.artists.length }}
              </UBadge>
            </div>

            <!-- Artist Search -->
            <div class="relative flex-1 max-w-xs">
              <input
                v-model="artistSearchQuery"
                type="text"
                placeholder="Search artists..."
                class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                @input="debouncedArtistSearch"
                @focus="showArtistResults = true"
                @blur="setTimeout(() => showArtistResults = false, 200)"
              >
              <UIcon
                v-if="artistSearchLoading"
                name="i-heroicons-arrow-path"
                class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400"
              />

              <!-- Search Results Dropdown -->
              <div
                v-if="showArtistResults && artistSearchResults.length > 0"
                class="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
              >
                <button
                  v-for="artist in artistSearchResults"
                  :key="artist.id"
                  type="button"
                  class="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between gap-2"
                  @mousedown.prevent="addArtist(artist)"
                >
                  <div class="min-w-0">
                    <div class="font-medium text-gray-900 truncate">
                      {{ artist.name }}
                    </div>
                    <div class="text-xs text-gray-500 truncate">
                      {{ artist.genres?.slice(0, 2).join(', ') || 'No genres' }}
                      <span v-if="artist.eventCount"> · {{ artist.eventCount }} events</span>
                    </div>
                  </div>
                  <UIcon
                    name="i-heroicons-plus"
                    class="w-4 h-4 text-primary-500 flex-shrink-0"
                  />
                </button>
              </div>

              <!-- No Results -->
              <div
                v-if="showArtistResults && artistSearchQuery.length >= 2 && !artistSearchLoading && artistSearchResults.length === 0"
                class="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500"
              >
                No artists found
              </div>
            </div>
          </div>
        </template>

        <div
          v-if="favorites.artists.length === 0"
          class="text-gray-500 text-sm"
        >
          Search above or browse events and click the heart icon next to artists you like.
        </div>

        <div
          v-else
          class="grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          <div
            v-for="artist in favorites.artists"
            :key="artist.id"
            class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
          >
            <NuxtLink
              :to="`/artists/${artist.slug}`"
              class="font-medium text-gray-900 hover:text-primary-600 transition-colors truncate"
            >
              {{ artist.name }}
            </NuxtLink>
            <UButton
              color="error"
              variant="ghost"
              icon="i-heroicons-x-mark"
              size="xs"
              @click="removeArtist(artist)"
            />
          </div>
        </div>
      </UCard>

      <!-- Favorite Venues -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-building-storefront"
                class="w-5 h-5 text-primary-500"
              />
              <span class="font-semibold">Venues</span>
              <UBadge
                v-if="favorites.venues.length"
                color="primary"
                variant="soft"
                size="sm"
              >
                {{ favorites.venues.length }}
              </UBadge>
            </div>

            <!-- Venue Search -->
            <div class="relative flex-1 max-w-xs">
              <input
                v-model="venueSearchQuery"
                type="text"
                placeholder="Search venues..."
                class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                @input="debouncedVenueSearch"
                @focus="showVenueResults = true"
                @blur="setTimeout(() => showVenueResults = false, 200)"
              >
              <UIcon
                v-if="venueSearchLoading"
                name="i-heroicons-arrow-path"
                class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400"
              />

              <!-- Search Results Dropdown -->
              <div
                v-if="showVenueResults && venueSearchResults.length > 0"
                class="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
              >
                <button
                  v-for="venue in venueSearchResults"
                  :key="venue.id"
                  type="button"
                  class="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between gap-2"
                  @mousedown.prevent="addVenue(venue)"
                >
                  <div class="min-w-0">
                    <div class="font-medium text-gray-900 truncate">
                      {{ venue.name }}
                    </div>
                    <div class="text-xs text-gray-500 truncate">
                      {{ venue.city || 'Unknown location' }}
                      <span v-if="venue.upcomingEventCount"> · {{ venue.upcomingEventCount }} upcoming</span>
                    </div>
                  </div>
                  <UIcon
                    name="i-heroicons-plus"
                    class="w-4 h-4 text-primary-500 flex-shrink-0"
                  />
                </button>
              </div>

              <!-- No Results -->
              <div
                v-if="showVenueResults && venueSearchQuery.length >= 2 && !venueSearchLoading && venueSearchResults.length === 0"
                class="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500"
              >
                No venues found
              </div>
            </div>
          </div>
        </template>

        <div
          v-if="favorites.venues.length === 0"
          class="text-gray-500 text-sm"
        >
          Search above or visit a venue page and click the heart icon to add it here.
        </div>

        <div
          v-else
          class="grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          <div
            v-for="venue in favorites.venues"
            :key="venue.id"
            class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
          >
            <NuxtLink
              :to="`/venues/${venue.slug}`"
              class="font-medium text-gray-900 hover:text-primary-600 transition-colors truncate"
            >
              {{ venue.name }}
            </NuxtLink>
            <UButton
              color="error"
              variant="ghost"
              icon="i-heroicons-x-mark"
              size="xs"
              @click="removeVenue(venue)"
            />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
