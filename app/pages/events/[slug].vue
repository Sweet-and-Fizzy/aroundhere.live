<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

const { data: event, error, refresh: refreshEvent } = await useFetch(`/api/events/by-slug/${slug}`)
const { getGenreLabel, getGenreBadgeClasses, genreLabels } = useGenreLabels()
const { getEventTypeLabel, getEventTypeBadgeClasses, eventTypeLabels } = useEventTypeLabels()
const { formatTime, formatDate } = useEventTime()
const { user } = useUserSession()
const { attendance } = useEventAttendance()

// Local attendance counts from API response
const interestedCount = ref(0)
const goingCount = ref(0)

// Initialize attendance state from API response
watch(event, (e) => {
  if (e) {
    interestedCount.value = e.interestedCount ?? 0
    goingCount.value = e.goingCount ?? 0
    // Set user's attendance status in composable state
    if (e.userAttendanceStatus && e.id) {
      attendance.value = { ...attendance.value, [e.id]: e.userAttendanceStatus }
    }
  }
}, { immediate: true })

function onAttendanceUpdate(counts: { interestedCount: number; goingCount: number }) {
  interestedCount.value = counts.interestedCount
  goingCount.value = counts.goingCount
}

// Constants
const DESCRIPTION_THRESHOLD = 400
const DESCRIPTION_HTML_TRUNCATE_MULTIPLIER = 2
const DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000 // 3 hours
const CALENDAR_DESCRIPTION_MAX_LENGTH = 1000

// Inline editing for classification
const isEditing = ref(false)
const editEventType = ref<string | null>(null)
const editGenres = ref<string[]>([])
const saving = ref(false)

const canEdit = computed(() => {
  return user.value && (user.value.role === 'ADMIN' || user.value.role === 'MODERATOR')
})

const availableEventTypes = computed(() => {
  return Object.entries(eventTypeLabels).map(([value, label]) => ({
    value,
    label: label as string,
  }))
})

const availableGenres = computed(() => {
  return Object.entries(genreLabels).map(([value, label]) => ({
    value,
    label: label as string,
  }))
})

function startEditing() {
  editEventType.value = event.value?.eventType || null
  editGenres.value = [...(event.value?.canonicalGenres || [])]
  isEditing.value = true
}

function cancelEditing() {
  isEditing.value = false
  editEventType.value = null
  editGenres.value = []
}

const toast = useToast()

async function saveEditing() {
  if (!event.value) return

  saving.value = true
  try {
    await $fetch(`/api/events/${event.value.id}/classification`, {
      method: 'PATCH',
      body: {
        eventType: editEventType.value,
        canonicalGenres: editGenres.value,
      },
    })

    // Update local event data
    event.value.eventType = editEventType.value
    event.value.canonicalGenres = editGenres.value

    isEditing.value = false
    toast.add({
      title: 'Success',
      description: 'Event classification updated',
      color: 'success',
    })
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to update event classification',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

// Cancel/restore event
const cancelling = ref(false)

async function toggleCancelled() {
  if (!event.value) return

  const willCancel = !event.value.isCancelled
  const action = willCancel ? 'cancelled' : 'restored'

  cancelling.value = true
  try {
    await $fetch(`/api/events/${event.value.id}/cancel`, {
      method: 'PATCH',
      body: {
        isCancelled: willCancel,
      },
    })

    // Update local event data
    event.value.isCancelled = willCancel

    toast.add({
      title: 'Success',
      description: `Event ${action} successfully`,
      color: 'success',
    })
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || `Failed to ${willCancel ? 'cancel' : 'restore'} event`,
      color: 'error',
    })
  } finally {
    cancelling.value = false
  }
}

// Calendar dropdown handlers
const openUrl = (url: string | null) => {
  if (url) {
    window.open(url, '_blank')
  }
}

const openGoogleCalendar = () => openUrl(googleCalendarUrl.value)
const openOutlookCalendar = () => openUrl(outlookCalendarUrl.value)
const downloadIcs = () => openUrl(icsUrl.value)


if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Event not found',
  })
}

// Get timezone from event's venue region, or event's region, fallback to default
const eventTimezone = computed(() =>
  event.value?.venue?.region?.timezone ||
  event.value?.region?.timezone ||
  'America/New_York'
)

const formattedDate = computed(() => {
  if (!event.value?.startsAt) return ''
  return formatDate(event.value.startsAt, eventTimezone.value, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})

const formattedTime = computed(() => {
  if (!event.value?.startsAt) return null
  return formatTime(event.value.startsAt, eventTimezone.value)
})

const doorsTime = computed(() => {
  if (!event.value?.doorsAt) return null
  return formatTime(event.value.doorsAt, eventTimezone.value)
})

// Format age restriction for display
const formattedAgeRestriction = computed(() => {
  if (!event.value?.ageRestriction) return ''
  if (event.value.ageRestriction === 'ALL_AGES') return 'All Ages'
  return event.value.ageRestriction.replace(/_/g, ' ').replace('PLUS', '+')
})

// Expandable description - start collapsed for both plain text and HTML
const descriptionExpanded = ref(false)

// Helper to strip HTML tags (cached to avoid repeated computation)
const descriptionTextContent = computed(() => {
  if (!sanitizedDescriptionHtml.value) return ''
  return sanitizedDescriptionHtml.value.replace(/<[^>]*>/g, '')
})

const hasLongDescription = computed(() => {
  // Check if HTML description exists and is long
  if (sanitizedDescriptionHtml.value) {
    return descriptionTextContent.value.length > DESCRIPTION_THRESHOLD
  }
  // For plain text descriptions
  if (event.value?.description) {
    return event.value.description.length > DESCRIPTION_THRESHOLD
  }
  return false
})

const truncatedDescription = computed(() => {
  if (!event.value?.description) return ''
  if (!hasLongDescription.value) return event.value.description
  return event.value.description.slice(0, DESCRIPTION_THRESHOLD) + '...'
})

const truncatedHtml = computed(() => {
  if (!sanitizedDescriptionHtml.value) return ''
  if (!hasLongDescription.value) return sanitizedDescriptionHtml.value
  // Simple truncation: show first N characters worth of HTML
  if (descriptionTextContent.value.length <= DESCRIPTION_THRESHOLD) return sanitizedDescriptionHtml.value
  // Return first ~threshold characters of HTML content
  return sanitizedDescriptionHtml.value.substring(0, DESCRIPTION_THRESHOLD * DESCRIPTION_HTML_TRUNCATE_MULTIPLIER) + '...'
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

// Build venue location string (reusable for maps and calendar)
const venueLocationParts = computed(() => {
  if (!event.value?.venue) return []
  const parts: string[] = []
  if (event.value.venue.name) parts.push(event.value.venue.name)
  if (event.value.venue.address) parts.push(event.value.venue.address)
  if (event.value.venue.city) parts.push(event.value.venue.city)
  if (event.value.venue.state || event.value.venue.postalCode) {
    parts.push([event.value.venue.state, event.value.venue.postalCode].filter(Boolean).join(' '))
  }
  return parts
})

const venueLocationString = computed(() => venueLocationParts.value.join(', '))

// Google Maps URL for venue
const mapUrl = computed(() => {
  if (!event.value?.venue) return ''
  // For map, we want address, city, state/zip (not venue name)
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
    const endDate = event.value.endsAt ? new Date(event.value.endsAt) : new Date(startDate.getTime() + DEFAULT_EVENT_DURATION_MS)

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

  // Use shared location string
  if (venueLocationString.value) {
    params.set('location', venueLocationString.value)
  }

  if (event.value.description) {
    params.set('details', event.value.description.substring(0, CALENDAR_DESCRIPTION_MAX_LENGTH))
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
    const endDate = event.value.endsAt ? new Date(event.value.endsAt) : new Date(startDate.getTime() + DEFAULT_EVENT_DURATION_MS)
    params.set('startdt', startDate.toISOString())
    params.set('enddt', endDate.toISOString())
  }

  // Use shared location string
  if (venueLocationString.value) {
    params.set('location', venueLocationString.value)
  }

  if (event.value.description) {
    params.set('body', event.value.description.substring(0, CALENDAR_DESCRIPTION_MAX_LENGTH))
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
          '@type': e.isMusic ? 'MusicEvent' : 'Event',
          name: e.title,
          startDate: e.startsAt,
          endDate: e.endsAt || undefined,
          doorTime: e.doorsAt || undefined,
          url: canonicalUrl.value,
          image: e.imageUrl || undefined,
          description: e.description || e.summary || undefined,
          eventStatus: 'https://schema.org/EventScheduled',
        }

        // Add event attendance mode if available
        if (e.eventType) {
          jsonLd.eventAttendanceMode = e.eventType === 'ONLINE'
            ? 'https://schema.org/OnlineEventAttendanceMode'
            : 'https://schema.org/OfflineEventAttendanceMode'
        }

        // Add venue/location
        if (e.venue) {
          const location: Record<string, unknown> = {
            '@type': 'Place',
            name: e.venue.name,
          }

          if (e.venue.address || e.venue.city || e.venue.state || e.venue.postalCode) {
            location.address = {
              '@type': 'PostalAddress',
              streetAddress: e.venue.address || undefined,
              addressLocality: e.venue.city || undefined,
              addressRegion: e.venue.state || undefined,
              postalCode: e.venue.postalCode || undefined,
            }
          }

          if (e.venue.latitude && e.venue.longitude) {
            location.geo = {
              '@type': 'GeoCoordinates',
              latitude: e.venue.latitude,
              longitude: e.venue.longitude,
            }
          }

          jsonLd.location = location
        }

        // Add ticket/offer information
        if (e.ticketUrl || e.coverCharge) {
          const offer: Record<string, unknown> = {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
          }

          if (e.ticketUrl) {
            offer.url = e.ticketUrl
          }

          if (e.coverCharge) {
            offer.price = e.coverCharge
            offer.priceCurrency = 'USD'
          }

          jsonLd.offers = offer
        }

        // Add performers/artists
        if (e.eventArtists?.length) {
          jsonLd.performer = e.eventArtists.map((ea: { artist: { name: string } }) => ({
            '@type': 'MusicGroup',
            name: ea.artist.name,
          }))
        }

        // Add organizer if source is available
        if (e.source) {
          jsonLd.organizer = {
            '@type': 'Organization',
            name: e.source.name,
            url: e.sourceUrl || undefined,
          }
        }

        return JSON.stringify(jsonLd)
      }),
    },
  ],
})
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <div v-if="event">
      <!-- Two Column Layout: Details + Image -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Hero Image (first in DOM for mobile, right column on desktop) -->
        <div
          v-if="event.imageUrl"
          class="lg:sticky lg:top-6 lg:self-start lg:order-2"
        >
          <img
            :src="event.imageUrl"
            :alt="event.title"
            class="w-full max-h-[32rem] object-contain mx-auto rounded-xl"
          >
        </div>

        <!-- Left Column: Event Info + Description (second in DOM for mobile, left column on desktop) -->
        <div class="lg:order-1 space-y-6">
          <!-- Event Info Card -->
          <UCard class="relative">
            <!-- Cancel/Restore Button (Admin Only) -->
            <UTooltip
              v-if="canEdit"
              :text="event.isCancelled ? 'Restore this event' : 'Mark as cancelled'"
              :popper="{ placement: 'left' }"
            >
              <UButton
                :icon="event.isCancelled ? 'i-heroicons-arrow-uturn-left' : 'i-heroicons-x-circle'"
                :color="event.isCancelled ? 'green' : 'red'"
                variant="ghost"
                size="sm"
                :loading="cancelling"
                class="absolute top-4 right-4 z-10"
                @click="toggleCancelled"
              />
            </UTooltip>

            <div class="space-y-3">
              <!-- Title -->
              <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 pr-12">
                {{ event.title }}
              </h1>

              <!-- Date and Time -->
              <div class="font-medium text-gray-700">
                {{ formattedDate }}
                <span v-if="formattedTime">at {{ formattedTime }}</span>
                <span
                  v-if="doorsTime"
                  class="text-gray-500 text-sm ml-2"
                >(Doors: {{ doorsTime }})</span>
                <UDropdownMenu
                  v-if="icsUrl || googleCalendarUrl || outlookCalendarUrl"
                  :items="[[
                    { label: 'Google Calendar', icon: 'i-heroicons-calendar-days', click: openGoogleCalendar },
                    { label: 'Outlook Calendar', icon: 'i-heroicons-calendar-days', click: openOutlookCalendar },
                    { label: 'Download .ics', icon: 'i-heroicons-arrow-down-tray', click: downloadIcs }
                  ]]"
                  :popper="{ placement: 'bottom-start' }"
                >
                  <UButton
                    color="neutral"
                    variant="soft"
                    icon="i-heroicons-calendar-days"
                    trailing-icon="i-heroicons-chevron-down"
                    size="xs"
                    class="ml-2"
                  >
                    Calendar
                  </UButton>
                </UDropdownMenu>
              </div>

              <!-- Event Type & Genre badges with inline editing -->
              <div v-if="!isEditing">
                <div class="flex flex-wrap items-center gap-2">
                  <!-- Event Type Badge -->
                  <UBadge
                    v-if="event.eventType"
                    :ui="{
                      base: getEventTypeBadgeClasses(event.eventType)
                    }"
                    size="md"
                  >
                    {{ getEventTypeLabel(event.eventType) }}
                  </UBadge>

                  <!-- Genre Badges -->
                  <UBadge
                    v-for="genre in event.canonicalGenres"
                    :key="genre"
                    :ui="{
                      base: getGenreBadgeClasses(genre)
                    }"
                    size="md"
                  >
                    {{ getGenreLabel(genre) }}
                  </UBadge>

                  <!-- Edit Button (Admin/Moderator only) -->
                  <UButton
                    v-if="canEdit"
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-heroicons-pencil-square"
                    aria-label="Edit event classification"
                    @click="startEditing"
                  >
                    Edit
                  </UButton>
                </div>
              </div>

              <!-- Inline Editing Form -->
              <div
                v-else
                class="space-y-3 p-3 bg-gray-50 rounded-lg"
              >
                <!-- Event Type Select -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
                  <select
                    v-model="editEventType"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option :value="null">
                      (None)
                    </option>
                    <option
                      v-for="type in availableEventTypes"
                      :key="type.value"
                      :value="type.value"
                    >
                      {{ type.label }}
                    </option>
                  </select>
                </div>

                <!-- Genres Multi-Select -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Genres</label>
                  <div class="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md bg-white min-h-[2.5rem]">
                    <label
                      v-for="genre in availableGenres"
                      :key="genre.value"
                      class="inline-flex items-center px-2 py-1 rounded text-xs cursor-pointer transition-colors"
                      :class="editGenres.includes(genre.value) ? 'bg-primary-100 text-primary-700 font-medium' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
                    >
                      <input
                        v-model="editGenres"
                        type="checkbox"
                        :value="genre.value"
                        class="sr-only"
                      >
                      {{ genre.label }}
                    </label>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2">
                  <UButton
                    size="sm"
                    color="primary"
                    :loading="saving"
                    @click="saveEditing"
                  >
                    Save
                  </UButton>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    :disabled="saving"
                    @click="cancelEditing"
                  >
                    Cancel
                  </UButton>
                </div>
              </div>

              <!-- Venue / Address -->
              <div v-if="event.venue">
                <div class="flex items-center gap-2">
                  <NuxtLink
                    :to="`/venues/${event.venue.slug}`"
                    class="font-medium text-primary-600 hover:text-primary-900 hover:bg-primary-50 transition-all px-2 py-1 -mx-2 -my-1 rounded inline-block"
                  >
                    {{ event.venue.name }}
                  </NuxtLink>
                  <FavoriteButton
                    :id="event.venue.id"
                    type="venue"
                    :name="event.venue.name"
                    :slug="event.venue.slug"
                    size="sm"
                  />
                  <UButton
                    v-if="mapUrl"
                    :href="mapUrl"
                    target="_blank"
                    color="neutral"
                    variant="soft"
                    icon="i-heroicons-map"
                    size="xs"
                    external
                  >
                    Map
                  </UButton>
                </div>
                <p
                  v-if="event.venue.address"
                  class="text-gray-600 text-sm mt-0.5"
                >
                  {{ event.venue.address }}<template v-if="event.venue.city">
                    , {{ event.venue.city }}
                  </template><template v-if="event.venue.state || event.venue.postalCode">
                    , {{ [event.venue.state, event.venue.postalCode].filter(Boolean).join(' ') }}
                  </template>
                </p>
                <!-- Attendance counts -->
                <p
                  v-if="interestedCount > 0 || goingCount > 0"
                  class="text-gray-500 text-sm mt-1"
                >
                  <template v-if="interestedCount > 0">
                    {{ interestedCount }} interested
                  </template>
                  <template v-if="interestedCount > 0 && goingCount > 0">
                    ,
                  </template>
                  <template v-if="goingCount > 0">
                    {{ goingCount }} going
                  </template>
                </p>
              </div>

              <!-- Cover and Age -->
              <div class="flex items-center gap-6 text-sm font-medium text-gray-700">
                <div v-if="event.coverCharge">
                  {{ event.coverCharge }}
                </div>
                <div>
                  {{ formattedAgeRestriction }}
                </div>
              </div>

              <!-- Tickets, Event Links, and Attendance Buttons -->
              <div class="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-gray-100">
                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    v-if="event.ticketUrl"
                    :href="event.ticketUrl"
                    target="_blank"
                    color="neutral"
                    variant="soft"
                    icon="i-heroicons-ticket"
                    size="xs"
                    external
                  >
                    Get Tickets
                  </UButton>
                  <UButton
                    v-if="event.sourceUrl"
                    :href="event.sourceUrl"
                    target="_blank"
                    color="neutral"
                    variant="soft"
                    icon="i-heroicons-arrow-top-right-on-square"
                    size="xs"
                    external
                  >
                    Official Page
                  </UButton>
                </div>
                <EventAttendanceButtons
                  :event-id="event.id"
                  show-labels
                  :interested-count="interestedCount"
                  :going-count="goingCount"
                  @update="onAttendanceUpdate"
                />
              </div>
            </div>
          </UCard>

          <!-- Description / About -->
          <UCard
            v-if="sanitizedDescriptionHtml || event.description"
            :ui="{ header: 'py-2 px-4 sm:px-6', body: 'py-2 px-4 sm:px-6' }"
          >
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
            <!-- Note: HTML content is sanitized to remove dangerous elements (see sanitizedDescriptionHtml computed property) -->
            <!-- eslint-disable vue/no-v-html -->
            <div
              v-if="sanitizedDescriptionHtml"
              class="prose prose-gray max-w-none"
            >
              <div
                v-if="!descriptionExpanded"
                class="html-content-container"
                v-html="truncatedHtml"
              />
              <div
                v-else
                class="html-content-container"
                v-html="sanitizedDescriptionHtml"
              />
              <!-- eslint-enable vue/no-v-html -->
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

          <!-- Artist Lineup - Admin Editor or Read-only -->
          <UCard
            v-if="event.eventArtists?.length || canEdit"
            :ui="{ header: 'py-2 px-4 sm:px-6', body: 'py-2 px-4 sm:px-6' }"
          >
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-heroicons-user-group"
                  class="w-5 h-5 text-primary-500"
                />
                <span class="font-semibold">Lineup</span>
              </div>
            </template>

            <template #default>
              <!-- Admin: Show editable artist list -->
              <EventArtistEditor
                v-if="canEdit"
                :event-id="event.id"
                :initial-artists="event.eventArtists || []"
                @updated="refreshEvent"
              />

              <!-- Non-admin: Show read-only list -->
              <div
                v-else
                class="space-y-2"
              >
                <div
                  v-for="(ea, index) in event.eventArtists"
                  :key="ea.artist.id"
                  class="flex items-center justify-between gap-2"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <NuxtLink
                      :to="`/artists/${ea.artist.slug}`"
                      class="font-medium truncate text-gray-900 hover:text-primary-600 transition-colors"
                    >
                      {{ ea.artist.name }}
                    </NuxtLink>
                    <span
                      v-if="index === 0 && event.eventArtists.length > 1"
                      class="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded"
                    >
                      headliner
                    </span>
                    <a
                      v-if="ea.artist.spotifyId && ['AUTO_MATCHED', 'VERIFIED'].includes(ea.artist.spotifyMatchStatus)"
                      :href="`https://open.spotify.com/artist/${ea.artist.spotifyId}`"
                      target="_blank"
                      class="text-[#1DB954] hover:text-[#1ed760]"
                      title="Listen on Spotify"
                    >
                      <SpotifyIcon class="w-4 h-4" />
                    </a>
                    <NuxtLink
                      v-if="canEdit"
                      :to="`/admin/artists?q=${encodeURIComponent(ea.artist.name)}`"
                      class="text-gray-400 hover:text-primary-600"
                      title="Manage artist"
                    >
                      <UIcon
                        name="i-heroicons-cog-6-tooth"
                        class="w-4 h-4"
                      />
                    </NuxtLink>
                  </div>
                  <FavoriteButton
                    :id="ea.artist.id"
                    type="artist"
                    :name="ea.artist.name"
                    :slug="ea.artist.slug"
                    size="sm"
                  />
                </div>
              </div>
            </template>
          </UCard>

          <!-- Artist Reviews -->
          <UCard
            v-if="artistReviews.length"
            :ui="{ header: 'py-2 px-4 sm:px-6', body: 'py-2 px-4 sm:px-6' }"
          >
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
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-wrap gap-3 mt-8 justify-center">
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
                  :ui="{
                    base: getGenreBadgeClasses(genre)
                  }"
                  size="sm"
                >
                  {{ getGenreLabel(genre) }}
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

    <BackToTop />
    <FloatingChatButton always-visible />
  </div>
</template>

<style scoped>
/* Isolate HTML content to prevent layout breaking */
.html-content-container {
  position: relative;
  contain: layout style paint;
  display: block;
  overflow: hidden;
  isolation: isolate;
}

/* Reset Squarespace-specific styles that might break layout */
.html-content-container :deep(.sqs-layout),
.html-content-container :deep(.sqs-block),
.html-content-container :deep(.row),
.html-content-container :deep(.col) {
  position: static !important;
  display: block !important;
  width: auto !important;
  max-width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  float: none !important;
  clear: both !important;
}

/* Prevent absolute positioning from escaping */
.html-content-container :deep(*[style*="position: absolute"]),
.html-content-container :deep(*[style*="position:absolute"]) {
  position: relative !important;
}

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
