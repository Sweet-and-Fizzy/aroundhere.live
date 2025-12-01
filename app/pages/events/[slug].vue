<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

const { data: event, error } = await useFetch(`/api/events/by-slug/${slug}`)

if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Event not found',
  })
}

const formattedDate = computed(() => {
  if (!event.value?.startsAt) return ''
  const date = new Date(event.value.startsAt)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})

const formattedTime = computed(() => {
  if (!event.value?.startsAt) return ''
  const date = new Date(event.value.startsAt)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
})

const doorsTime = computed(() => {
  if (!event.value?.doorsAt) return null
  const date = new Date(event.value.doorsAt)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
})

// Expandable description - show more by default on detail page (400 chars)
const descriptionExpanded = ref(false)
const descriptionThreshold = 400

const hasLongDescription = computed(() => {
  return event.value?.description && event.value.description.length > descriptionThreshold
})

const truncatedDescription = computed(() => {
  if (!event.value?.description) return ''
  if (!hasLongDescription.value) return event.value.description
  return event.value.description.slice(0, descriptionThreshold) + '...'
})

// Google Maps URL for venue
const mapUrl = computed(() => {
  if (!event.value?.venue) return ''
  const parts: string[] = []
  if (event.value.venue.address) parts.push(event.value.venue.address)
  if (event.value.venue.city) parts.push(event.value.venue.city)
  if (event.value.venue.state || event.value.venue.postalCode) {
    parts.push([event.value.venue.state, event.value.venue.postalCode].filter(Boolean).join(' '))
  }
  const address = parts.join(', ')
  if (!address) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
})

// ICS calendar file URL
const icsUrl = computed(() => {
  if (!event.value?.slug) return ''
  return `/api/events/by-slug/${event.value.slug}/ical`
})

// Google Calendar URL (opens directly in Google Calendar)
const googleCalendarUrl = computed(() => {
  if (!event.value) return ''
  const params = new URLSearchParams()
  params.set('action', 'TEMPLATE')
  params.set('text', event.value.title)
  
  if (event.value.startsAt) {
    const startDate = new Date(event.value.startsAt)
    const endDate = event.value.endsAt ? new Date(event.value.endsAt) : new Date(startDate.getTime() + 3 * 60 * 60 * 1000)
    
    // Format: YYYYMMDDTHHMMSS
    const formatDate = (date: Date) => {
      const year = date.getUTCFullYear()
      const month = String(date.getUTCMonth() + 1).padStart(2, '0')
      const day = String(date.getUTCDate()).padStart(2, '0')
      const hours = String(date.getUTCHours()).padStart(2, '0')
      const minutes = String(date.getUTCMinutes()).padStart(2, '0')
      const seconds = String(date.getUTCSeconds()).padStart(2, '0')
      return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
    }
    
    params.set('dates', `${formatDate(startDate)}/${formatDate(endDate)}`)
  }
  
  // Build location
  const locationParts = []
  if (event.value.venue?.name) locationParts.push(event.value.venue.name)
  if (event.value.venue?.address) locationParts.push(event.value.venue.address)
  if (event.value.venue?.city) locationParts.push(event.value.venue.city)
  if (event.value.venue?.state || event.value.venue?.postalCode) {
    locationParts.push([event.value.venue.state, event.value.venue.postalCode].filter(Boolean).join(' '))
  }
  if (locationParts.length > 0) {
    params.set('location', locationParts.join(', '))
  }
  
  if (event.value.description) {
    params.set('details', event.value.description.substring(0, 1000))
  }
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`
})

// Outlook Calendar URL (opens directly in Outlook web)
const outlookCalendarUrl = computed(() => {
  if (!event.value) return ''
  const params = new URLSearchParams()
  
  params.set('subject', event.value.title)
  
  if (event.value.startsAt) {
    const startDate = new Date(event.value.startsAt)
    const endDate = event.value.endsAt ? new Date(event.value.endsAt) : new Date(startDate.getTime() + 3 * 60 * 60 * 1000)
    params.set('startdt', startDate.toISOString())
    params.set('enddt', endDate.toISOString())
  }
  
  // Build location
  const locationParts = []
  if (event.value.venue?.name) locationParts.push(event.value.venue.name)
  if (event.value.venue?.address) locationParts.push(event.value.venue.address)
  if (event.value.venue?.city) locationParts.push(event.value.venue.city)
  if (event.value.venue?.state || event.value.venue?.postalCode) {
    locationParts.push([event.value.venue.state, event.value.venue.postalCode].filter(Boolean).join(' '))
  }
  if (locationParts.length > 0) {
    params.set('location', locationParts.join(', '))
  }
  
  if (event.value.description) {
    params.set('body', event.value.description.substring(0, 1000))
  }
  
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
})

useSeoMeta({
  title: () => event.value?.title ? `${event.value.title} - Local Music Listings` : 'Event Details',
  description: () => event.value?.description || `Live music event at ${event.value?.venue?.name}`,
  ogImage: () => event.value?.imageUrl,
})
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <div v-if="event">
      <!-- Hero Image -->
      <div
        v-if="event.imageUrl"
        class="mb-6"
      >
        <img
          :src="event.imageUrl"
          :alt="event.title"
          class="w-full max-h-[28rem] object-contain mx-auto rounded-xl"
        >
      </div>

      <!-- Header -->
      <header class="mb-6">
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          {{ event.title }}
        </h1>

        <div class="flex flex-wrap items-center gap-3 text-gray-600">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-calendar"
              class="w-5 h-5 text-primary-500"
            />
            <time
              :datetime="event.startsAt"
              class="font-medium"
            >
              {{ formattedDate }}
            </time>
          </div>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-clock"
              class="w-5 h-5 text-primary-500"
            />
            <span>{{ formattedTime }}</span>
            <span
              v-if="doorsTime"
              class="text-gray-400"
            >(Doors: {{ doorsTime }})</span>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <div class="grid gap-6">
        <!-- Venue Card -->
        <UCard v-if="event.venue">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-map-pin"
                class="w-5 h-5 text-primary-500"
              />
              <span class="font-semibold">Venue</span>
            </div>
          </template>

          <NuxtLink
            :to="`/venues/${event.venue.slug}`"
            class="text-lg font-medium text-primary-600 hover:text-primary-700"
          >
            {{ event.venue.name }}
          </NuxtLink>
          <p
            v-if="event.venue.address"
            class="text-gray-600 mt-1"
          >
            {{ event.venue.address }}<template v-if="event.venue.city">
              , {{ event.venue.city }}
            </template><template v-if="event.venue.state || event.venue.postalCode">
              , {{ [event.venue.state, event.venue.postalCode].filter(Boolean).join(' ') }}
            </template>
          </p>
          <div
            v-if="mapUrl"
            class="mt-2 flex gap-2"
          >
            <a
              :href="mapUrl"
              target="_blank"
              class="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
            >
              <UIcon
                name="i-heroicons-map"
                class="w-4 h-4"
              />
              View on Map
            </a>
          </div>
        </UCard>

        <!-- Description -->
        <UCard v-if="event.descriptionHtml || event.description">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-5 h-5 text-primary-500"
              />
              <span class="font-semibold">About</span>
            </div>
          </template>
          <!-- Rich HTML description with images/videos -->
          <div
            v-if="event.descriptionHtml"
            class="prose prose-gray max-w-none"
          >
            <div v-html="event.descriptionHtml" />
          </div>
          <!-- Fallback to plain text description -->
          <div
            v-else
            class="text-gray-700"
          >
            <p
              v-if="!descriptionExpanded"
              class="whitespace-pre-line"
            >
              {{ truncatedDescription }}
            </p>
            <p
              v-else
              class="whitespace-pre-line"
            >
              {{ event.description }}
            </p>
            <button
              v-if="hasLongDescription"
              class="text-primary-600 hover:text-primary-700 font-medium mt-3 inline-flex items-center gap-1"
              @click="descriptionExpanded = !descriptionExpanded"
            >
              <UIcon
                :name="descriptionExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                class="w-4 h-4"
              />
              {{ descriptionExpanded ? 'Show less' : 'Show more' }}
            </button>
          </div>
        </UCard>

        <!-- Details -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-ticket"
                class="w-5 h-5 text-primary-500"
              />
              <span class="font-semibold">Details</span>
            </div>
          </template>

          <dl class="grid grid-cols-2 gap-4">
            <div v-if="event.coverCharge">
              <dt class="text-sm text-gray-500">
                Cover
              </dt>
              <dd class="font-medium">
                {{ event.coverCharge }}
              </dd>
            </div>

            <div>
              <dt class="text-sm text-gray-500">
                Age
              </dt>
              <dd class="font-medium">
                {{ event.ageRestriction === 'ALL_AGES' ? 'All Ages' : event.ageRestriction.replace(/_/g, ' ').replace('PLUS', '+') }}
              </dd>
            </div>

            <div v-if="event.source">
              <dt class="text-sm text-gray-500">
                Source
              </dt>
              <dd class="font-medium">
                {{ event.source.name }}
              </dd>
            </div>

            <div v-if="icsUrl || googleCalendarUrl || outlookCalendarUrl">
              <dt class="text-sm text-gray-500">
                Calendar
              </dt>
              <dd class="font-medium">
                <div class="flex flex-wrap gap-2">
                  <a
                    v-if="googleCalendarUrl"
                    :href="googleCalendarUrl"
                    target="_blank"
                    class="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm"
                  >
                    <UIcon
                      name="i-heroicons-calendar-days"
                      class="w-4 h-4"
                    />
                    Google Calendar
                  </a>
                  <a
                    v-if="outlookCalendarUrl"
                    :href="outlookCalendarUrl"
                    target="_blank"
                    class="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm"
                  >
                    <UIcon
                      name="i-heroicons-calendar-days"
                      class="w-4 h-4"
                    />
                    Outlook
                  </a>
                  <a
                    v-if="icsUrl"
                    :href="icsUrl"
                    class="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm"
                  >
                    <UIcon
                      name="i-heroicons-arrow-down-tray"
                      class="w-4 h-4"
                    />
                    Download .ics
                  </a>
                </div>
              </dd>
            </div>
          </dl>
        </UCard>

        <!-- Artists section hidden until manual curation is implemented -->
      </div>

      <!-- Actions -->
      <div class="flex flex-wrap gap-3 mt-8 pt-6 border-t border-gray-200">
        <UButton
          v-if="event.sourceUrl"
          :to="event.sourceUrl"
          target="_blank"
          size="lg"
          color="primary"
          icon="i-heroicons-arrow-top-right-on-square"
        >
          Event Page
        </UButton>

        <UButton
          v-if="event.ticketUrl"
          :to="event.ticketUrl"
          target="_blank"
          size="lg"
          color="neutral"
          icon="i-heroicons-ticket"
        >
          Get Tickets
        </UButton>

        <UButton
          to="/"
          size="lg"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-left"
        >
          Back to Events
        </UButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Styles for rich HTML content - using native CSS for Tailwind v4 compatibility */
.prose :deep(figure) {
  margin-top: 1rem;
  margin-bottom: 1rem;
}

.prose :deep(figure img) {
  width: 100%;
  border-radius: 0.5rem;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  max-height: 24rem;
  object-fit: cover;
}

.prose :deep(figcaption) {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.5rem;
  text-align: center;
  font-weight: 500;
}

.prose :deep(.video-embed) {
  margin-top: 1rem;
  margin-bottom: 1rem;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.prose :deep(.video-embed iframe) {
  width: 100%;
  aspect-ratio: 16 / 9;
}

.prose :deep(a) {
  color: var(--color-primary-600, #2563eb);
  text-decoration: underline;
}

.prose :deep(a:hover) {
  color: var(--color-primary-700, #1d4ed8);
}

.prose :deep(p) {
  margin-bottom: 1rem;
  color: #374151;
}

.prose :deep(strong) {
  font-weight: 600;
}
</style>
