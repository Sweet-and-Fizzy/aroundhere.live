<script setup lang="ts">
import type { Event } from '~/composables/useEvents'

const route = useRoute()
const slug = route.params.slug as string

interface Venue {
  id: string
  name: string
  slug: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  website?: string
  phone?: string
  email?: string
  capacity?: number
  venueType?: string
  latitude?: number
  longitude?: number
  logoUrl?: string
  imageUrl?: string
  description?: string
  accessibilityInfo?: string
  region?: {
    id: string
    name: string
    slug: string
  }
}

const { data, error } = await useFetch<{ venue: Venue; events: Event[] }>(`/api/venues/${slug}`)

if (error.value) {
  throw createError({
    statusCode: 404,
    message: 'Venue not found',
  })
}

const venue = computed(() => data.value?.venue)
const events = computed(() => data.value?.events ?? [])

// View mode toggle - persist in localStorage
const viewMode = ref<'card' | 'compact'>('card')
onMounted(() => {
  const saved = localStorage.getItem('venueEventViewMode')
  if (saved === 'compact' || saved === 'card') {
    viewMode.value = saved
  }
})
watch(viewMode, (newMode) => {
  localStorage.setItem('venueEventViewMode', newMode)
})

const config = useRuntimeConfig()

// Favorites
const { isVenueFavorited, toggleVenue } = useFavorites()
const togglingFavorite = ref(false)
async function handleToggleFavorite() {
  if (!venue.value) return
  togglingFavorite.value = true
  try {
    await toggleVenue({ id: venue.value.id, name: venue.value.name, slug: venue.value.slug })
  } finally {
    togglingFavorite.value = false
  }
}

// Check if user is admin or moderator
const { loggedIn, user } = useUserSession()
const isAdminOrModerator = computed(() => {
  if (!loggedIn.value) return false
  const role = user.value?.role as string
  return role === 'ADMIN' || role === 'MODERATOR'
})

// Venue claim modal
const claimModalOpen = ref(false)

// Check if user is a verified moderator of this venue
const isVenueModerator = ref(false)
onMounted(() => {
  if (loggedIn.value && venue.value) {
    $fetch('/api/user/moderated-venues').then((res: any) => {
      const items = res?.items || []
      isVenueModerator.value = items.some((v: any) => v.venueId === venue.value?.id)
    }).catch(() => {})
  }
})

const seoDescription = computed(() => {
  if (!venue.value) return ''
  const desc = venue.value.description?.slice(0, 160)
  if (desc) return desc
  return `Upcoming live music shows at ${venue.value.name} in ${venue.value.city}, ${venue.value.state}. Browse events and get tickets.`
})

const canonicalUrl = computed(() => {
  return `${config.public.siteUrl}/venues/${venue.value?.slug}`
})

useSeoMeta({
  title: () => `${venue.value?.name} - Live Events`,
  description: () => seoDescription.value,
  // Open Graph
  ogTitle: () => `${venue.value?.name} - Live Events`,
  ogDescription: () => seoDescription.value,
  ogImage: () => venue.value?.imageUrl || venue.value?.logoUrl || `${config.public.siteUrl}/og-image-venues.png`,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  ogUrl: () => canonicalUrl.value,
  ogType: 'website',
  // Twitter
  twitterCard: 'summary_large_image',
  twitterTitle: () => `${venue.value?.name} - Live Events`,
  twitterDescription: () => seoDescription.value,
  twitterImage: () => venue.value?.imageUrl || venue.value?.logoUrl || `${config.public.siteUrl}/og-image-venues.png`,
})

// Add canonical link
useHead({
  link: [
    { rel: 'canonical', href: canonicalUrl },
  ],
})

// JSON-LD structured data for venue
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: computed(() => {
        if (!venue.value) return '{}'
        const v = venue.value
        const jsonLd: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@type': 'MusicVenue',
          name: v.name,
          url: canonicalUrl.value,
          image: v.imageUrl || v.logoUrl || undefined,
          description: v.description || undefined,
          telephone: v.phone || undefined,
          address: {
            '@type': 'PostalAddress',
            streetAddress: v.address || undefined,
            addressLocality: v.city || undefined,
            addressRegion: v.state || undefined,
            postalCode: v.postalCode || undefined,
          },
        }
        if (v.latitude && v.longitude) {
          jsonLd.geo = {
            '@type': 'GeoCoordinates',
            latitude: v.latitude,
            longitude: v.longitude,
          }
        }
        if (v.website) {
          jsonLd.sameAs = v.website
        }
        return JSON.stringify(jsonLd)
      }),
    },
  ],
})

</script>

<template>
  <div v-if="venue">
    <!-- Header with optional banner image -->
    <div
      class="relative text-white py-12 -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 px-4 sm:px-6 lg:px-8 mb-8 min-h-[280px] sm:min-h-[320px] flex items-end"
      :class="venue.imageUrl ? '' : 'bg-gray-900'"
    >
      <!-- Banner image background -->
      <div
        v-if="venue.imageUrl"
        class="absolute inset-0 overflow-hidden"
      >
        <img
          :src="venue.imageUrl"
          :alt="`${venue.name} banner`"
          class="w-full h-full object-cover object-center"
        >
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
      </div>

      <div class="relative max-w-4xl mx-auto">
        <!-- Admin buttons — subtle, top-right -->
        <div
          v-if="isVenueModerator || (loggedIn && !isAdminOrModerator) || isAdminOrModerator"
          class="flex items-center justify-end gap-2 mb-4"
        >
          <UButton
            v-if="isVenueModerator"
            :to="`/venues/${venue.slug}/moderate`"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-shield-check"
            size="sm"
            class="text-white/80 hover:text-white"
          >
            Manage Submissions
          </UButton>
          <UButton
            v-else-if="loggedIn && !isAdminOrModerator"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-shield-check"
            size="sm"
            class="text-white/80 hover:text-white"
            @click="claimModalOpen = true"
          >
            Claim Venue
          </UButton>
          <UButton
            v-if="isAdminOrModerator && venue"
            :to="`/admin/venues/${venue.id}/edit`"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-pencil-square"
            size="sm"
            class="text-white/80 hover:text-white"
          >
            Edit
          </UButton>
        </div>

        <!-- Venue identity -->
        <div class="flex items-center gap-4">
          <img
            v-if="venue.logoUrl"
            :src="venue.logoUrl"
            :alt="`${venue.name} logo`"
            class="h-20 w-20 object-contain bg-white/10 backdrop-blur rounded-lg p-2 border border-white/20"
          >
          <h1 class="text-3xl md:text-4xl font-bold drop-shadow-lg">
            {{ venue.name }}
          </h1>
        </div>
      </div>
    </div>

    <div class="max-w-4xl mx-auto">
      <!-- Description — standalone, not boxed -->
      <p
        v-if="venue.description"
        class="text-gray-700 leading-relaxed mt-2"
      >
        {{ venue.description }}
      </p>

      <!-- Logistics + Map -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
        <!-- Logistics panel -->
        <div class="bg-gray-50 rounded-xl p-4 space-y-3">
          <!-- Address -->
          <a
            v-if="venue.address"
            :href="`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue.address, venue.city, venue.state].filter(Boolean).join(', '))}`"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-start gap-3 text-gray-700 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-map-pin"
              class="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"
            />
            <span>{{ [venue.address, venue.city, venue.state].filter(Boolean).join(', ') }}</span>
          </a>

          <!-- Website -->
          <a
            v-if="venue.website"
            :href="venue.website"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-3 text-gray-700 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-globe-alt"
              class="w-5 h-5 text-gray-400 flex-shrink-0"
            />
            <span>Website</span>
          </a>

          <!-- Phone -->
          <a
            v-if="venue.phone"
            :href="`tel:${venue.phone.replace(/\D/g, '')}`"
            class="flex items-center gap-3 text-gray-700 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-phone"
              class="w-5 h-5 text-gray-400 flex-shrink-0"
            />
            <span>{{ venue.phone }}</span>
          </a>

          <!-- Email -->
          <a
            v-if="venue.email"
            :href="`mailto:${venue.email}`"
            class="flex items-center gap-3 text-gray-700 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-envelope"
              class="w-5 h-5 text-gray-400 flex-shrink-0"
            />
            <span class="truncate">{{ venue.email }}</span>
          </a>

          <!-- Save venue — matches contact row styling -->
          <button
            v-if="loggedIn"
            class="flex items-center gap-3 pt-2 border-t border-gray-200 w-full text-left transition-colors group"
            :class="isVenueFavorited(venue.id) ? 'text-red-500' : 'text-gray-700 hover:text-red-500'"
            :disabled="togglingFavorite"
            @click="handleToggleFavorite"
          >
            <UIcon
              :name="isVenueFavorited(venue.id) ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
              class="w-5 h-5 flex-shrink-0"
              :class="togglingFavorite && 'animate-pulse'"
            />
            <span>{{ isVenueFavorited(venue.id) ? 'Saved' : 'Save venue' }}</span>
          </button>

          <!-- Venue type + capacity — subtle metadata -->
          <div
            v-if="venue.venueType || venue.capacity"
            class="flex items-center gap-4 pt-2 border-t border-gray-200 text-sm text-gray-600"
          >
            <span
              v-if="venue.venueType"
              class="flex items-center gap-1.5"
            >
              <UIcon
                name="i-heroicons-building-storefront"
                class="w-4 h-4 text-gray-400"
              />
              {{ venue.venueType.replace(/_/g, ' ') }}
            </span>
            <span
              v-if="venue.capacity"
              class="flex items-center gap-1.5"
            >
              <UIcon
                name="i-heroicons-user-group"
                class="w-4 h-4 text-gray-400"
              />
              {{ venue.capacity }} capacity
            </span>
          </div>
        </div>

        <!-- Map -->
        <div
          v-if="venue.latitude && venue.longitude"
          class="space-y-2"
        >
          <div class="h-56 rounded-xl overflow-hidden bg-gray-100">
            <VenueMap
              :key="`venue-${venue.latitude}-${venue.longitude}`"
              :venues="[{
                id: 'single-venue',
                name: venue.name,
                slug: '',
                latitude: venue.latitude,
                longitude: venue.longitude,
                city: venue.city,
                address: venue.address
              }]"
              :force-center="true"
              class="w-full h-full"
            />
          </div>
        </div>
      </div>

      <!-- Accessibility info -->
      <div
        v-if="venue.accessibilityInfo"
        class="mt-5 bg-blue-50 rounded-xl p-4"
      >
        <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2 mb-2">
          <UIcon
            name="i-heroicons-information-circle"
            class="w-4 h-4 text-blue-500"
          />
          Accessibility
        </h3>
        <p class="text-sm text-gray-700 whitespace-pre-line">
          {{ venue.accessibilityInfo }}
        </p>
      </div>
    </div>

    <!-- Events Section -->
    <div class="max-w-4xl mx-auto mt-10 pt-8 border-t border-gray-200">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-gray-900">
          Upcoming Events
          <span
            v-if="events.length > 0"
            class="text-gray-400 font-normal"
          >{{ events.length }}</span>
        </h2>

        <!-- View Toggle Buttons -->
        <div
          v-if="events.length > 0"
          class="flex gap-1 bg-gray-100 rounded-lg p-1"
          role="group"
          aria-label="View mode"
        >
          <button
            :class="[
              'p-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500',
              viewMode === 'card'
                ? 'bg-white shadow-sm text-primary-600'
                : 'text-gray-600 hover:text-gray-800'
            ]"
            aria-label="Card view"
            :aria-pressed="viewMode === 'card'"
            @click="viewMode = 'card'"
          >
            <UIcon
              name="i-heroicons-squares-2x2"
              class="w-4 h-4 sm:w-5 sm:h-5"
              aria-hidden="true"
            />
          </button>
          <button
            :class="[
              'p-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500',
              viewMode === 'compact'
                ? 'bg-white shadow-sm text-primary-600'
                : 'text-gray-600 hover:text-gray-800'
            ]"
            aria-label="Compact view"
            :aria-pressed="viewMode === 'compact'"
            @click="viewMode = 'compact'"
          >
            <UIcon
              name="i-heroicons-bars-3"
              class="w-4 h-4 sm:w-5 sm:h-5"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <EventList
        :events="events"
        :view-mode="viewMode"
        :hide-venue="true"
      />
    </div>

    <BackToTop />
    <FloatingChatButton always-visible />

    <VenueClaimModal
      v-if="venue"
      v-model:open="claimModalOpen"
      :venue-id="venue.id"
      :venue-name="venue.name"
    />
  </div>
</template>
