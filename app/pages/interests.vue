<script setup lang="ts">
import { nextTick } from 'vue'
import type { Event } from '~/composables/useEvents'

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

// Helper functions for blur handlers
function hideArtistResultsDelayed() {
  setTimeout(() => { showArtistResults.value = false }, 200)
}
function hideVenueResultsDelayed() {
  setTimeout(() => { showVenueResults.value = false }, 200)
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

// Taste profile state
const hasTasteProfile = ref(false)
const refreshingProfile = ref(false)
const profileRefreshed = ref(false)

// View mode for recommendations - default to compact for narrow column
const recViewMode = ref<'card' | 'compact'>('compact')
// Date range for recommendations (in days)
const recDays = ref(14)
const recDaysOptions = [
  { label: 'Next 7 days', value: 7 },
  { label: 'Next 2 weeks', value: 14 },
  { label: 'Next month', value: 30 },
  { label: 'Next 2 months', value: 60 },
]

onMounted(() => {
  const savedMode = localStorage.getItem('recViewMode')
  if (savedMode === 'compact' || savedMode === 'card') {
    recViewMode.value = savedMode
  }
  const savedDays = localStorage.getItem('recDays')
  if (savedDays) {
    const days = parseInt(savedDays, 10)
    if ([7, 14, 30, 60].includes(days)) {
      recDays.value = days
    }
  }
})
watch(recViewMode, (newMode) => {
  localStorage.setItem('recViewMode', newMode)
})
watch(recDays, (newDays) => {
  localStorage.setItem('recDays', String(newDays))
  fetchRecommendations()
})

// Recommendations state - use Event type for compatibility with EventList
interface RecommendedEvent extends Event {
  score: number
  reasons: string[]
}
const recommendations = ref<RecommendedEvent[]>([])
const loadingRecommendations = ref(false)

// Build a map of event ID -> reasons for EventList
const recommendationReasonsMap = computed(() => {
  const map: Record<string, string[]> = {}
  for (const rec of recommendations.value) {
    if (rec.reasons.length > 0) {
      map[rec.id] = rec.reasons
    }
  }
  return map
})

// Interest description
const interestDescription = ref('')
const originalInterestDescription = ref('')
const savingInterest = ref(false)
const interestSaved = ref(false)
// eslint-disable-next-line no-undef
const interestTextarea = ref<HTMLTextAreaElement | null>(null)

// Auto-resize textarea to fit content
function autoResizeTextarea() {
  const textarea = interestTextarea.value
  if (!textarea) return
  // Reset height to auto to get the correct scrollHeight
  textarea.style.height = 'auto'
  // Set height to scrollHeight, respecting max-height from CSS
  textarea.style.height = `${textarea.scrollHeight}px`
}

// Fetch recommendations
async function fetchRecommendations() {
  loadingRecommendations.value = true
  try {
    const data = await $fetch('/api/user/recommendations', {
      query: { limit: 10, days: recDays.value },
    })
    // Map API response to match Event type (null -> undefined for optional fields)
    recommendations.value = (data.recommendations || []).map((rec) => ({
      ...rec,
      summary: rec.summary ?? undefined,
    })) as RecommendedEvent[]
    hasTasteProfile.value = data.hasTasteProfile ?? false
  } catch (e) {
    console.error('Failed to load recommendations:', e)
    recommendations.value = []
  } finally {
    loadingRecommendations.value = false
  }
}

// Refresh taste profile
async function refreshTasteProfile() {
  refreshingProfile.value = true
  profileRefreshed.value = false
  try {
    await $fetch('/api/user/taste-profile', { method: 'POST' })
    hasTasteProfile.value = true
    profileRefreshed.value = true
    // Refresh recommendations with new profile
    await fetchRecommendations()
    // Hide success message after 3 seconds
    setTimeout(() => {
      profileRefreshed.value = false
    }, 3000)
  } catch (e) {
    console.error('Failed to refresh taste profile:', e)
  } finally {
    refreshingProfile.value = false
  }
}

// Load interest description and recommendations on mount
onMounted(async () => {
  try {
    const data = await $fetch('/api/user/preferences')
    interestDescription.value = data.interestDescription || ''
    originalInterestDescription.value = data.interestDescription || ''
    hasTasteProfile.value = data.hasTasteProfile ?? false
    // Resize textarea after content loads
    await nextTick()
    autoResizeTextarea()
  } catch (e) {
    console.error('Failed to load preferences:', e)
  }

  // Fetch recommendations
  fetchRecommendations()
})

async function saveInterestDescription() {
  // Only save if changed
  if (interestDescription.value === originalInterestDescription.value) return

  savingInterest.value = true
  interestSaved.value = false
  try {
    await $fetch('/api/user/preferences', {
      method: 'PUT',
      body: { interestDescription: interestDescription.value.trim() },
    })
    originalInterestDescription.value = interestDescription.value.trim()
    interestSaved.value = true
    // Hide checkmark after 3 seconds
    setTimeout(() => {
      interestSaved.value = false
    }, 3000)
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
  <div class="max-w-6xl mx-auto px-4 py-8">
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

    <!-- Two-column layout -->
    <div
      v-else
      class="grid grid-cols-1 lg:grid-cols-2 gap-8"
    >
      <!-- Left column: Interest settings -->
      <div class="space-y-8">
        <!-- Onboarding banner for users with no favorites -->
        <div
          v-if="!hasFavorites"
          class="bg-gradient-to-br from-primary-50 to-blue-50 border border-primary-200 rounded-xl p-6"
        >
          <h2 class="text-xl font-semibold text-gray-900 mb-2">
            Get Started
          </h2>
          <p class="text-gray-600 mb-3">
            Tell us what you're into below to get personalized recommendations.
          </p>
          <p class="text-gray-500 text-sm">
            You can also mark events as "interested" or "going" as you browse, or save favorite artists and venues from their profile pages.
          </p>
        </div>

        <!-- Info banner (only shown when user has favorites) -->
        <div
          v-if="hasFavorites"
          class="bg-primary-50 border border-primary-200 rounded-lg p-4"
        >
          <p class="text-sm text-primary-800">
            Your interests personalize your experience and power our recommendations.
            Get alerts for events you'll love, plus weekly picks tailored to your taste.
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
                ref="interestTextarea"
                v-model="interestDescription"
                rows="1"
                maxlength="500"
                placeholder="e.g., I love indie rock and folk music. Jazz is growing on me lately."
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none overflow-hidden"
                style="min-height: 2.5rem; max-height: 10rem;"
                @input="autoResizeTextarea"
              />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-400">
                {{ interestDescription.length }}/500
              </span>
              <div class="flex items-center gap-2">
                <span
                  v-if="savingInterest"
                  class="text-xs text-gray-500"
                >
                  Saving...
                </span>
                <span
                  v-else-if="interestSaved"
                  class="text-xs text-green-600 flex items-center gap-1"
                >
                  <UIcon
                    name="i-heroicons-check-circle"
                    class="w-4 h-4"
                  />
                  Saved
                </span>
              </div>
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
                  aria-label="Search artists"
                  class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  @input="debouncedArtistSearch"
                  @focus="showArtistResults = true"
                  @blur="hideArtistResultsDelayed"
                >
                <UIcon
                  v-if="artistSearchLoading"
                  name="i-heroicons-arrow-path"
                  class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400"
                  aria-hidden="true"
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
                  aria-label="Search venues"
                  class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  @input="debouncedVenueSearch"
                  @focus="showVenueResults = true"
                  @blur="hideVenueResultsDelayed"
                >
                <UIcon
                  v-if="venueSearchLoading"
                  name="i-heroicons-arrow-path"
                  class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400"
                  aria-hidden="true"
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

      <!-- Right column: Recommendations -->
      <div>
        <div class="sticky top-4">
          <UCard v-if="hasFavorites || hasTasteProfile">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <UIcon
                    name="i-heroicons-light-bulb"
                    class="w-5 h-5 text-amber-500"
                  />
                  <span class="font-semibold">Recommendations</span>
                </div>
                <div class="flex items-center gap-2">
                  <!-- Date range selector -->
                  <select
                    v-model="recDays"
                    aria-label="Recommendation time range"
                    class="text-xs border-gray-300 rounded-md py-1 pl-2 pr-6 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option
                      v-for="opt in recDaysOptions"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                  <!-- View mode toggle -->
                  <div
                    class="flex items-center bg-gray-100 rounded-md p-0.5"
                    role="group"
                    aria-label="View mode"
                  >
                    <button
                      type="button"
                      :class="[
                        'p-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500',
                        recViewMode === 'card'
                          ? 'bg-white shadow-sm text-primary-600'
                          : 'text-gray-600 hover:text-gray-800'
                      ]"
                      aria-label="Card view"
                      :aria-pressed="recViewMode === 'card'"
                      @click="recViewMode = 'card'"
                    >
                      <UIcon
                        name="i-heroicons-squares-2x2"
                        class="w-3.5 h-3.5"
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      :class="[
                        'p-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500',
                        recViewMode === 'compact'
                          ? 'bg-white shadow-sm text-primary-600'
                          : 'text-gray-600 hover:text-gray-800'
                      ]"
                      aria-label="Compact view"
                      :aria-pressed="recViewMode === 'compact'"
                      @click="recViewMode = 'compact'"
                    >
                      <UIcon
                        name="i-heroicons-bars-3"
                        class="w-3.5 h-3.5"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  <span
                    v-if="profileRefreshed"
                    class="text-xs text-green-600 flex items-center gap-1"
                  >
                    <UIcon
                      name="i-heroicons-check-circle"
                      class="w-4 h-4"
                    />
                  </span>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :loading="refreshingProfile"
                    :disabled="refreshingProfile"
                    title="Refresh taste profile"
                    @click="refreshTasteProfile"
                  >
                    <UIcon
                      name="i-heroicons-arrow-path"
                      class="w-4 h-4"
                    />
                  </UButton>
                </div>
              </div>
            </template>

            <div v-if="loadingRecommendations">
              <div class="space-y-3">
                <USkeleton
                  v-for="i in 3"
                  :key="i"
                  class="h-14 rounded-lg"
                />
              </div>
            </div>

            <div
              v-else-if="recommendations.length === 0"
              class="text-center py-4"
            >
              <p class="text-gray-500 text-sm">
                <template v-if="!hasTasteProfile">
                  Add some interests and click refresh to see recommendations.
                </template>
                <template v-else>
                  No strong matches found. Try adjusting your interests.
                </template>
              </p>
            </div>

            <div v-else>
              <EventList
                :events="recommendations"
                :view-mode="recViewMode"
                :recommendation-reasons="recommendationReasonsMap"
                force-stacked-layout
                hide-venue
              />

              <div class="text-center pt-3">
                <NuxtLink
                  to="/?myEvents=recommended"
                  class="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  View all recommendations
                </NuxtLink>
              </div>
            </div>
          </UCard>

          <!-- Empty state for right column when no favorites -->
          <UCard
            v-else
            class="bg-gray-50"
          >
            <div class="text-center py-4">
              <UIcon
                name="i-heroicons-light-bulb"
                class="w-8 h-8 text-gray-300 mx-auto mb-2"
              />
              <p class="text-gray-500 text-sm">
                Your recommendations will appear here once you add some interests.
              </p>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>
