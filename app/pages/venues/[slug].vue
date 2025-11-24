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

useSeoMeta({
  title: () => `${venue.value?.name} - Live Music Events`,
  description: () => `Upcoming live music shows at ${venue.value?.name} in ${venue.value?.city}, ${venue.value?.state}`,
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
    <!-- Header -->
    <div class="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-8 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 mb-8">
      <div class="max-w-4xl mx-auto">
        <NuxtLink to="/venues" class="text-primary-200 hover:text-white text-sm mb-2 inline-flex items-center gap-1">
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          Back to all venues
        </NuxtLink>
        <div class="flex items-center gap-4 mt-2">
          <img
            v-if="venue.logoUrl"
            :src="venue.logoUrl"
            :alt="`${venue.name} logo`"
            class="h-16 w-auto object-contain bg-black rounded-lg p-2"
          />
          <h1 class="text-3xl font-bold">{{ venue.name }}</h1>
        </div>
        <div class="mt-2 flex flex-wrap gap-4 text-primary-100">
          <a
            v-if="fullAddress"
            :href="googleMapsUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-white flex items-center gap-1"
          >
            <UIcon name="i-heroicons-map-pin" class="w-4 h-4" />
            {{ fullAddress }}
          </a>
          <a
            v-if="venue.website"
            :href="venue.website"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-white flex items-center gap-1"
          >
            <UIcon name="i-heroicons-globe-alt" class="w-4 h-4" />
            Website
          </a>
          <span v-if="venue.phone" class="flex items-center gap-1">
            <UIcon name="i-heroicons-phone" class="w-4 h-4" />
            {{ venue.phone }}
          </span>
        </div>
      </div>
    </div>

    <!-- Events Section -->
    <div class="max-w-4xl mx-auto">
      <h2 class="text-xl font-semibold text-gray-900 mb-4">
        Upcoming Events ({{ events.length }})
      </h2>

      <div v-if="events.length === 0" class="text-center py-12">
        <UIcon name="i-heroicons-calendar-days" class="w-12 h-12 mx-auto text-gray-400" />
        <h3 class="mt-4 text-lg font-medium text-gray-900">No upcoming events</h3>
        <p class="mt-2 text-gray-500">Check back later for new shows at this venue.</p>
      </div>

      <div v-else class="space-y-3">
        <EventCard
          v-for="event in events"
          :key="event.id"
          :event="event"
        />
      </div>
    </div>
  </div>
</template>
