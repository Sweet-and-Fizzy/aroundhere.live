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
  capacity?: number
  venueType?: string
  latitude?: number
  longitude?: number
  logoUrl?: string
  imageUrl?: string
  description?: string
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

const fullAddress = computed(() => {
  if (!venue.value) return ''
  const parts: string[] = []
  
  if (venue.value.address) {
    parts.push(venue.value.address.trim())
  }
  
  if (venue.value.city) {
    parts.push(venue.value.city.trim())
  }
  
  // Format state and postal code together with proper spacing
  if (venue.value.state || venue.value.postalCode) {
    const stateZip = [venue.value.state?.trim(), venue.value.postalCode?.trim()].filter(Boolean).join(' ')
    if (stateZip) {
      parts.push(stateZip)
    }
  }
  
  return parts.join(', ')
})

const googleMapsUrl = computed(() => {
  if (!fullAddress.value) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress.value)}`
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
        <BackButton
          variant="light"
          class="mb-4"
        />
        <div class="flex items-center gap-4 mt-2">
          <img
            v-if="venue.logoUrl"
            :src="venue.logoUrl"
            :alt="`${venue.name} logo`"
            class="h-20 w-20 object-contain bg-white/10 backdrop-blur rounded-lg p-2 border border-white/20"
          >
          <div>
            <h1 class="text-3xl md:text-4xl font-bold drop-shadow-lg">
              {{ venue.name }}
            </h1>
            <div
              v-if="venue.venueType"
              class="mt-1 text-white/70 text-sm"
            >
              {{ venue.venueType.replace('_', ' ') }}
            </div>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-4 text-white/80">
          <a
            v-if="fullAddress"
            :href="googleMapsUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-white flex items-center gap-1"
          >
            <UIcon
              name="i-heroicons-map-pin"
              class="w-4 h-4"
            />
            {{ fullAddress }}
          </a>
          <a
            v-if="venue.website"
            :href="venue.website"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-white flex items-center gap-1"
          >
            <UIcon
              name="i-heroicons-globe-alt"
              class="w-4 h-4"
            />
            Website
          </a>
          <a
            v-if="venue.phone"
            :href="`tel:${venue.phone.replace(/\D/g, '')}`"
            class="hover:text-white flex items-center gap-1"
          >
            <UIcon
              name="i-heroicons-phone"
              class="w-4 h-4"
            />
            {{ venue.phone }}
          </a>
        </div>

        <p
          v-if="venue.description"
          class="mt-4 text-white/90 max-w-2xl"
        >
          {{ venue.description }}
        </p>
      </div>
    </div>

    <!-- Events Section -->
    <div class="max-w-4xl mx-auto">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold text-gray-900">
          Upcoming Events ({{ events.length }})
        </h2>

        <!-- View Toggle Buttons -->
        <div
          v-if="events.length > 0"
          class="flex gap-1 bg-gray-100 rounded-lg p-1"
        >
          <button
            :class="[
              'p-1.5 rounded transition-colors',
              viewMode === 'card'
                ? 'bg-white shadow-sm text-primary-600'
                : 'text-gray-600 hover:text-gray-800'
            ]"
            title="Card view"
            @click="viewMode = 'card'"
          >
            <UIcon
              name="i-heroicons-squares-2x2"
              class="w-4 h-4 sm:w-5 sm:h-5"
            />
          </button>
          <button
            :class="[
              'p-1.5 rounded transition-colors',
              viewMode === 'compact'
                ? 'bg-white shadow-sm text-primary-600'
                : 'text-gray-600 hover:text-gray-800'
            ]"
            title="Compact view"
            @click="viewMode = 'compact'"
          >
            <UIcon
              name="i-heroicons-bars-3"
              class="w-4 h-4 sm:w-5 sm:h-5"
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
  </div>
</template>
