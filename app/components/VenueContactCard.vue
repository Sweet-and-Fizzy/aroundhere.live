<script setup lang="ts">
interface Props {
  venue: {
    name: string
    address?: string
    city?: string
    state?: string
    postalCode?: string
    website?: string
    phone?: string
    email?: string
    latitude?: number
    longitude?: number
    accessibilityInfo?: string
    description?: string
    venueType?: string
    capacity?: number
  }
}

const props = defineProps<Props>()

const fullAddress = computed(() => {
  const parts: string[] = []

  if (props.venue.address) {
    parts.push(props.venue.address.trim())
  }

  if (props.venue.city) {
    parts.push(props.venue.city.trim())
  }

  if (props.venue.state || props.venue.postalCode) {
    const stateZip = [props.venue.state?.trim(), props.venue.postalCode?.trim()].filter(Boolean).join(' ')
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

// For Apple Maps (iOS) or Google Maps (Android)
const mapsAppUrl = computed(() => {
  if (!fullAddress.value) return ''
  // Universal URL that works on both iOS and Android
  return `https://maps.google.com/?q=${encodeURIComponent(fullAddress.value)}`
})

// Detect if user is on mobile
const isMobile = ref(false)
onMounted(() => {
  isMobile.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
})

// Accessibility section expand/collapse
const ACCESSIBILITY_THRESHOLD = 150
const accessibilityExpanded = ref(false)
const hasLongAccessibility = computed(() => {
  return (props.venue.accessibilityInfo?.length ?? 0) > ACCESSIBILITY_THRESHOLD
})
const truncatedAccessibility = computed(() => {
  if (!props.venue.accessibilityInfo) return ''
  if (!hasLongAccessibility.value) return props.venue.accessibilityInfo
  return props.venue.accessibilityInfo.slice(0, ACCESSIBILITY_THRESHOLD) + '...'
})
</script>

<template>
  <UCard class="mt-6">
    <template #header>
      <h2 class="text-xl font-semibold">
        Venue Information
      </h2>
    </template>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Left Column: Description, Venue Details & Accessibility -->
      <div class="space-y-4">
        <!-- Description -->
        <p
          v-if="venue.description"
          class="text-gray-700"
        >
          {{ venue.description }}
        </p>

        <!-- Venue Details -->
        <div
          v-if="venue.venueType || venue.capacity"
          class="flex flex-wrap gap-3 text-sm"
          :class="venue.description ? 'pt-4 border-t border-gray-200' : ''"
        >
          <div
            v-if="venue.venueType"
            class="flex items-center gap-1.5 text-gray-600"
          >
            <UIcon
              name="i-heroicons-building-storefront"
              class="w-4 h-4"
            />
            <span>{{ venue.venueType.replace(/_/g, ' ') }}</span>
          </div>
          <div
            v-if="venue.capacity"
            class="flex items-center gap-1.5 text-gray-600"
          >
            <UIcon
              name="i-heroicons-user-group"
              class="w-4 h-4"
            />
            <span>Capacity: {{ venue.capacity }}</span>
          </div>
        </div>

        <!-- Accessibility Information -->
        <div
          v-if="venue.accessibilityInfo"
          class="pt-4 border-t border-gray-200"
        >
          <h3 class="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <UIcon
              name="i-heroicons-information-circle"
              class="w-5 h-5 text-primary-600"
            />
            Accessibility
          </h3>
          <p class="text-sm text-gray-700 whitespace-pre-line">
            {{ accessibilityExpanded ? venue.accessibilityInfo : truncatedAccessibility }}
          </p>
          <button
            v-if="hasLongAccessibility"
            class="text-sm text-primary-600 hover:text-primary-700 font-medium mt-1"
            @click="accessibilityExpanded = !accessibilityExpanded"
          >
            {{ accessibilityExpanded ? 'Show less' : 'Show more' }}
          </button>
        </div>
      </div>

      <!-- Right Column: Map & Contact Information -->
      <div class="space-y-4">
        <!-- Map -->
        <div
          v-if="venue.latitude && venue.longitude"
          class="space-y-3"
        >
          <div class="h-48 md:h-56 rounded-lg overflow-hidden bg-gray-100">
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

          <!-- Open in Maps button -->
          <a
            v-if="fullAddress"
            :href="isMobile ? mapsAppUrl : googleMapsUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <UIcon
              name="i-heroicons-map-pin"
              class="w-4 h-4"
            />
            <span>Open in Maps</span>
          </a>
        </div>

        <!-- Contact Information -->
        <div
          class="space-y-3"
          :class="(venue.latitude && venue.longitude) ? 'pt-4 border-t border-gray-200' : ''"
        >
          <a
            v-if="fullAddress"
            :href="googleMapsUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-start gap-2 text-gray-700 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-map-pin"
              class="w-5 h-5 mt-0.5 flex-shrink-0"
            />
            <span>{{ fullAddress }}</span>
          </a>

          <a
            v-if="venue.website"
            :href="venue.website"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 text-gray-700 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-globe-alt"
              class="w-5 h-5 flex-shrink-0"
            />
            <span class="truncate">Website</span>
          </a>

          <a
            v-if="venue.phone"
            :href="`tel:${venue.phone.replace(/\D/g, '')}`"
            class="flex items-center gap-2 text-gray-700 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-phone"
              class="w-5 h-5 flex-shrink-0"
            />
            <span>{{ venue.phone }}</span>
          </a>

          <a
            v-if="venue.email"
            :href="`mailto:${venue.email}`"
            class="flex items-center gap-2 text-gray-700 hover:text-primary-600 transition-colors"
          >
            <UIcon
              name="i-heroicons-envelope"
              class="w-5 h-5 flex-shrink-0"
            />
            <span class="truncate">{{ venue.email }}</span>
          </a>
        </div>
      </div>
    </div>
  </UCard>
</template>
