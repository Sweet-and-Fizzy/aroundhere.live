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

// Check if time is midnight (indicating no time was specified)
const hasSpecificTime = computed(() => {
  if (!event.value?.startsAt) return false
  const date = new Date(event.value.startsAt)
  return date.getHours() !== 0 || date.getMinutes() !== 0
})

const formattedTime = computed(() => {
  if (!event.value?.startsAt || !hasSpecificTime.value) return null
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

// Artists with verified Spotify matches
const spotifyArtists = computed(() => {
  if (!event.value?.eventArtists) return []
  return event.value.eventArtists
    .filter(ea => ea.artist.spotifyId && ['AUTO_MATCHED', 'VERIFIED'].includes(ea.artist.spotifyMatchStatus))
    .map(ea => ea.artist)
})

// Collect all artist reviews from event artists
const artistReviews = computed(() => {
  if (!event.value?.eventArtists) return []
  const reviews: Array<{
    artistName: string
    review: {
      id: string
      title: string
      url: string
      excerpt: string | null
      publishedAt: string | null
      source: { name: string; slug: string }
    }
  }> = []

  for (const ea of event.value.eventArtists) {
    if (ea.artist.artistReviews?.length) {
      for (const ar of ea.artist.artistReviews) {
        reviews.push({
          artistName: ea.artist.name,
          review: ar.review,
        })
      }
    }
  }
  return reviews
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

const config = useRuntimeConfig()

// Sanitize HTML to remove self-referencing iframes
const sanitizedDescriptionHtml = computed(() => {
  if (!event.value?.descriptionHtml) return null
  const domain = config.public.siteUrl?.replace(/^https?:\/\//, '') || 'aroundhere.live'
  // Remove iframes that embed our own site
  return event.value.descriptionHtml
    .replace(new RegExp(`<iframe[^>]*src=["'][^"']*${domain}[^"']*["'][^>]*>.*?</iframe>`, 'gi'), '')
    .replace(new RegExp(`<iframe[^>]*src=["'][^"']*${domain}[^"']*["'][^>]*/?>`, 'gi'), '')
    .replace(new RegExp(`<iframe[^>]*src=["'][^"']*localhost[^"']*["'][^>]*>.*?</iframe>`, 'gi'), '')
    .replace(new RegExp(`<iframe[^>]*src=["'][^"']*localhost[^"']*["'][^>]*/?>`, 'gi'), '')
})

// Fetch related events with pagination
const relatedLimit = ref(6)
const { data: relatedEvents } = await useFetch(() => `/api/events/${event.value?.id}/related?limit=${relatedLimit.value}`, {
  // Only fetch if we have an event
  immediate: !!event.value?.id,
  watch: [relatedLimit],
})

const hasMoreRelated = computed(() => {
  if (!relatedEvents.value) return false
  return relatedEvents.value.events?.length === relatedLimit.value && relatedEvents.value.hasMore !== false
})

function loadMoreRelated() {
  relatedLimit.value += 6
}

// Build a clean description for SEO - prefer summary, then description
const seoDescription = computed(() => {
  if (!event.value) return ''
  // Use summary if available (AI-generated concise version)
  if (event.value.summary) return event.value.summary.slice(0, 160)
  // Fall back to description
  if (event.value.description) return event.value.description.slice(0, 160)
  // Last resort: generate from title/venue/date
  const venue = event.value.venue?.name || ''
  const date = formattedDate.value
  return `${event.value.title} at ${venue} on ${date}`
})

// Canonical URL for this event
const canonicalUrl = computed(() => {
  return `${config.public.siteUrl}/events/${event.value?.slug}`
})

useSeoMeta({
  title: () => event.value?.title ? `${event.value.title} - AroundHere` : 'Event Details',
  description: () => seoDescription.value,
  // Open Graph
  ogTitle: () => event.value?.title,
  ogDescription: () => seoDescription.value,
  ogImage: () => event.value?.imageUrl,
  ogUrl: () => canonicalUrl.value,
  ogType: 'website',
  // Twitter
  twitterTitle: () => event.value?.title,
  twitterDescription: () => seoDescription.value,
  twitterImage: () => event.value?.imageUrl,
})

// Add canonical link
useHead({
  link: [
    { rel: 'canonical', href: canonicalUrl },
  ],
})

// JSON-LD structured data for events
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: computed(() => {
        if (!event.value) return '{}'
        const e = event.value
        const jsonLd: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@type': 'MusicEvent',
          name: e.title,
          startDate: e.startsAt,
          endDate: e.endsAt || undefined,
          doorTime: e.doorsAt || undefined,
          url: canonicalUrl.value,
          image: e.imageUrl || undefined,
          description: e.description || undefined,
        }
        if (e.venue) {
          jsonLd.location = {
            '@type': 'Place',
            name: e.venue.name,
            address: {
              '@type': 'PostalAddress',
              streetAddress: e.venue.address || undefined,
              addressLocality: e.venue.city || undefined,
              addressRegion: e.venue.state || undefined,
              postalCode: e.venue.postalCode || undefined,
            },
          }
          if (e.venue.latitude && e.venue.longitude) {
            (jsonLd.location as Record<string, unknown>).geo = {
              '@type': 'GeoCoordinates',
              latitude: e.venue.latitude,
              longitude: e.venue.longitude,
            }
          }
        }
        if (e.ticketUrl) {
          jsonLd.offers = {
            '@type': 'Offer',
            url: e.ticketUrl,
            availability: 'https://schema.org/InStock',
          }
          if (e.coverCharge) {
            (jsonLd.offers as Record<string, unknown>).price = e.coverCharge
          }
        }
        if (e.eventArtists?.length) {
          jsonLd.performer = e.eventArtists.map((ea: { artist: { name: string } }) => ({
            '@type': 'MusicGroup',
            name: ea.artist.name,
          }))
        }
        return JSON.stringify(jsonLd)
      }),
    },
  ],
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
          <div
            v-if="formattedTime"
            class="flex items-center gap-2"
          >
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

        <!-- Genre badges -->
        <div
          v-if="event.canonicalGenres?.length"
          class="mt-3 flex flex-wrap gap-2"
        >
          <UBadge
            v-for="genre in event.canonicalGenres"
            :key="genre"
            color="primary"
            variant="soft"
            size="sm"
          >
            {{ genre }}
          </UBadge>
        </div>
      </header>

      <!-- Main Content -->
      <div class="grid gap-6">
        <!-- Description -->
        <UCard v-if="sanitizedDescriptionHtml || event.description">
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
            v-if="sanitizedDescriptionHtml"
            class="prose prose-gray max-w-none"
          >
            <div v-html="sanitizedDescriptionHtml" />
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

        <!-- Artist Reviews -->
        <UCard v-if="artistReviews.length">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-newspaper"
                class="w-5 h-5 text-primary-500"
              />
              <span class="font-semibold">Press</span>
            </div>
          </template>

          <div class="space-y-4">
            <div
              v-for="ar in artistReviews"
              :key="ar.review.id"
              class="border-l-2 border-primary-200 pl-4"
            >
              <a
                :href="ar.review.url"
                target="_blank"
                class="text-primary-600 hover:text-primary-700 font-medium hover:underline"
              >
                {{ ar.review.title }}
              </a>
              <p
                v-if="ar.review.excerpt"
                class="text-gray-600 text-sm mt-1 line-clamp-3"
              >
                "{{ ar.review.excerpt }}"
              </p>
              <div class="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                <span>{{ ar.review.source.name }}</span>
                <span v-if="ar.review.publishedAt">•</span>
                <time
                  v-if="ar.review.publishedAt"
                  :datetime="ar.review.publishedAt"
                >
                  {{ new Date(ar.review.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                </time>
                <span>•</span>
                <span class="text-gray-400">featuring {{ ar.artistName }}</span>
              </div>
            </div>
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

            <div v-if="spotifyArtists.length">
              <dt class="text-sm text-gray-500">
                Listen
              </dt>
              <dd class="font-medium">
                <div class="flex flex-wrap gap-3">
                  <a
                    v-for="artist in spotifyArtists"
                    :key="artist.id"
                    :href="`https://open.spotify.com/artist/${artist.spotifyId}`"
                    target="_blank"
                    class="inline-flex items-center gap-1.5 text-[#1DB954] hover:text-[#1ed760] text-sm"
                  >
                    <SpotifyIcon class="w-4 h-4" />
                    {{ artist.name }}
                  </a>
                </div>
              </dd>
            </div>
          </dl>
        </UCard>
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

        <BackButton />
      </div>

      <!-- Related Events -->
      <section
        v-if="relatedEvents?.events?.length"
        class="mt-12 pt-8 border-t border-gray-200"
      >
        <h2 class="text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">
          <UIcon
            name="i-heroicons-sparkles"
            class="w-5 h-5 text-primary-500"
          />
          Similar Shows
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="related in relatedEvents.events"
            :key="related.id"
            :to="`/events/${related.slug}`"
            class="group block bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-primary-400 hover:shadow-lg transition-all duration-200"
          >
            <!-- Image with date overlay -->
            <div class="relative">
              <div
                v-if="related.imageUrl"
                class="aspect-square overflow-hidden bg-black flex items-center justify-center"
              >
                <img
                  :src="related.imageUrl"
                  :alt="related.title"
                  class="max-w-full max-h-full object-contain"
                  loading="lazy"
                >
              </div>
              <div
                v-else
                class="aspect-square bg-black flex items-center justify-center p-4"
              >
                <span class="text-white/80 font-semibold text-center line-clamp-3">{{ related.title }}</span>
              </div>
              <!-- Date badge -->
              <div class="absolute top-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm">
                <div class="text-xs font-bold text-primary-600 uppercase">
                  {{ new Date(related.startsAt).toLocaleDateString('en-US', { month: 'short' }) }}
                </div>
                <div class="text-lg font-bold text-gray-900 leading-none">
                  {{ new Date(related.startsAt).getDate() }}
                </div>
              </div>
            </div>
            <!-- Content -->
            <div class="p-3">
              <h3 class="font-semibold text-gray-900 group-hover:text-primary-600 line-clamp-2 leading-snug transition-colors">
                {{ related.title }}
              </h3>
              <div
                v-if="related.venue"
                class="mt-1.5 flex items-center gap-1 text-sm text-gray-500"
              >
                <UIcon
                  name="i-heroicons-map-pin"
                  class="w-3.5 h-3.5 flex-shrink-0"
                />
                <span class="truncate">{{ related.venue.name }}</span>
              </div>
              <div
                v-if="related.canonicalGenres?.length"
                class="mt-2 flex flex-wrap gap-1"
              >
                <UBadge
                  v-for="genre in related.canonicalGenres.slice(0, 2)"
                  :key="genre"
                  color="primary"
                  variant="soft"
                  size="xs"
                >
                  {{ genre }}
                </UBadge>
              </div>
              <div
                v-if="related.coverCharge"
                class="mt-2 text-sm font-medium text-green-600"
              >
                {{ related.coverCharge }}
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- Show More / Back buttons -->
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <UButton
            v-if="hasMoreRelated"
            color="neutral"
            variant="outline"
            icon="i-heroicons-arrow-down"
            @click="loadMoreRelated"
          >
            Show More
          </UButton>
          <BackButton />
        </div>
      </section>
    </div>

    <FloatingChatButton always-visible />
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
