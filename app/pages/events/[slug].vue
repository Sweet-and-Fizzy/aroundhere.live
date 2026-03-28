<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

const { data: event, error, refresh: refreshEvent } = await useFetch(`/api/events/by-slug/${slug}`)
const { getGenreLabel, genreLabels } = useGenreLabels()
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
    event.value.eventType = editEventType.value as typeof event.value.eventType
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

// Event report modal
const reportModalOpen = ref(false)

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

// Use plain text when collapsed (safe to truncate), HTML when expanded
const shouldUseHtml = computed(() => {
  // Only use HTML if expanded, or if there's no plain text fallback
  if (descriptionExpanded.value) return true
  if (!event.value?.description) return true
  return false
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

// Address string without venue name or zip code (for display under venue link)
const venueAddressString = computed(() => {
  if (!event.value?.venue?.address) return ''
  const parts: string[] = [event.value.venue.address]
  if (event.value.venue.city) {
    parts.push(event.value.venue.city)
  }
  if (event.value.venue.state) {
    if (parts.length > 1) {
      // Append state to city: "Northampton, MA"
      parts[parts.length - 1] += `, ${event.value.venue.state}`
    } else {
      // No city, add state as its own part: "123 Main St, MA"
      parts.push(event.value.venue.state)
    }
  }
  return parts.join(', ')
})

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
  ogImage: () => event.value?.imageUrl || `${config.public.siteUrl}/og-image.png`,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  ogUrl: () => canonicalUrl.value,
  ogType: 'website',
  // Twitter
  twitterCard: 'summary_large_image',
  twitterTitle: () => event.value?.title,
  twitterDescription: () => seoDescription.value,
  twitterImage: () => event.value?.imageUrl || `${config.public.siteUrl}/og-image.png`,
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

        // Add event attendance mode - all events are in-person
        jsonLd.eventAttendanceMode = 'https://schema.org/OfflineEventAttendanceMode'

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
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
        <!-- Hero Image (first in DOM for mobile, right column on desktop) -->
        <div
          v-if="event.imageUrl"
          class="lg:sticky lg:top-6 lg:self-start lg:order-2 -mx-4 sm:mx-0"
        >
          <img
            :src="event.imageUrl"
            :alt="event.title"
            class="w-full max-h-[32rem] object-contain mx-auto sm:rounded-xl"
          >
        </div>

        <!-- Left Column: Event Info + Description -->
        <div class="lg:order-1 space-y-5">
          <!-- ============================================ -->
          <!-- HERO ZONE: Title + Date — the anchor of the page -->
          <!-- ============================================ -->
          <div class="relative">
            <!-- Admin: Cancel/Restore -->
            <UTooltip
              v-if="canEdit"
              :text="event.isCancelled ? 'Restore this event' : 'Mark as cancelled'"
              :popper="{ placement: 'left' }"
            >
              <UButton
                :icon="event.isCancelled ? 'i-heroicons-arrow-uturn-left' : 'i-heroicons-x-circle'"
                :color="event.isCancelled ? 'success' : 'error'"
                variant="ghost"
                size="sm"
                :loading="cancelling"
                class="absolute top-0 right-0 z-10"
                @click="toggleCancelled"
              />
            </UTooltip>

            <!-- Badges row — event type + genres, quiet above the title -->
            <div
              v-if="!isEditing"
              class="flex flex-wrap items-center gap-1.5 mb-3"
            >
              <UBadge
                v-if="event.eventType"
                :ui="{ base: getEventTypeBadgeClasses(event.eventType) }"
                size="sm"
              >
                {{ getEventTypeLabel(event.eventType) }}
              </UBadge>
              <UBadge
                v-for="genre in event.canonicalGenres"
                :key="genre"
                :ui="{ base: 'bg-gray-100 text-gray-700' }"
                size="sm"
              >
                {{ getGenreLabel(genre) }}
              </UBadge>
              <UButton
                v-if="canEdit"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-heroicons-pencil-square"
                aria-label="Edit event classification"
                @click="startEditing"
              />
            </div>

            <!-- Inline Editing Form -->
            <div
              v-else
              class="space-y-3 p-3 mb-3 bg-gray-50 rounded-lg border border-gray-200"
            >
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

            <!-- Title -->
            <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight pr-10">
              {{ event.title }}
            </h1>

            <!-- Date/Time — prominent treatment -->
            <div class="mt-3 flex items-start gap-3">
              <!-- Calendar chip -->
              <div
                v-if="event.startsAt"
                class="flex-shrink-0 w-14 text-center bg-gray-900 text-white rounded-lg overflow-hidden shadow-sm"
              >
                <div class="text-[10px] font-bold uppercase tracking-wider bg-blue-600 py-0.5">
                  {{ new Date(event.startsAt).toLocaleDateString('en-US', { month: 'short', timeZone: eventTimezone }) }}
                </div>
                <div class="text-2xl font-extrabold py-1 leading-none">
                  {{ new Date(event.startsAt).toLocaleDateString('en-US', { day: 'numeric', timeZone: eventTimezone }) }}
                </div>
              </div>
              <div class="pt-0.5">
                <div class="text-lg font-semibold text-gray-900">
                  {{ formattedDate }}
                </div>
                <div class="flex items-center gap-2 text-gray-600 text-sm mt-0.5">
                  <span
                    v-if="formattedTime"
                    class="font-medium"
                  >{{ formattedTime }}</span>
                  <span
                    v-if="doorsTime"
                    class="text-gray-400"
                  >·</span>
                  <span v-if="doorsTime">Doors {{ doorsTime }}</span>
                  <UDropdownMenu
                    v-if="icsUrl || googleCalendarUrl || outlookCalendarUrl"
                    :items="[[
                      { label: 'Google Calendar', icon: 'i-heroicons-calendar-days', click: openGoogleCalendar },
                      { label: 'Outlook Calendar', icon: 'i-heroicons-calendar-days', click: openOutlookCalendar },
                      { label: 'Download .ics', icon: 'i-heroicons-arrow-down-tray', click: downloadIcs }
                    ]]"
                    :popper="{ placement: 'bottom-start' }"
                  >
                    <button class="text-gray-400 hover:text-primary-600 transition-colors ml-1">
                      <UIcon
                        name="i-heroicons-calendar-days"
                        class="w-4 h-4"
                      />
                    </button>
                  </UDropdownMenu>
                </div>
              </div>
            </div>
          </div>

          <!-- Pending Review Notice -->
          <div
            v-if="event.reviewStatus === 'PENDING' && event.submittedById"
            class="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2"
          >
            <div class="flex items-center gap-2 text-sm text-yellow-800">
              <UIcon
                name="i-heroicons-clock"
                class="w-4 h-4"
              />
              <span class="font-medium">Pending Review</span>
            </div>
            <p class="text-xs text-yellow-700 mt-1">
              This event is awaiting review and is not yet publicly visible.
            </p>
          </div>

          <!-- ============================================ -->
          <!-- LOGISTICS ZONE: Venue, price, age — the practical info -->
          <!-- ============================================ -->
          <div class="bg-gray-50 rounded-xl p-4 space-y-3">
            <!-- Venue -->
            <div
              v-if="event.venue"
              class="flex items-start gap-3"
            >
              <UIcon
                name="i-heroicons-map-pin"
                class="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"
              />
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <NuxtLink
                    :to="`/venues/${event.venue.slug}`"
                    class="font-semibold text-gray-900 hover:text-primary-600 transition-colors"
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
                </div>
                <a
                  v-if="venueAddressString && mapUrl"
                  :href="mapUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                >
                  {{ venueAddressString }}
                </a>
                <p
                  v-else-if="venueAddressString"
                  class="text-sm text-gray-600"
                >
                  {{ venueAddressString }}
                </p>
              </div>
            </div>
            <!-- Venue-less event: show custom location -->
            <div
              v-else-if="event.locationName"
              class="flex items-start gap-3"
            >
              <UIcon
                name="i-heroicons-map-pin"
                class="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"
              />
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-gray-900">{{ event.locationName }}</span>
                  <UButton
                    v-if="event.locationLat && event.locationLng"
                    :href="`https://www.google.com/maps/search/?api=1&query=${event.locationLat},${event.locationLng}`"
                    target="_blank"
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-arrow-top-right-on-square"
                    size="xs"
                    external
                  />
                </div>
                <p
                  v-if="event.locationAddress"
                  class="text-sm text-gray-600"
                >
                  {{ event.locationAddress }}
                </p>
                <p
                  v-else-if="event.locationCity"
                  class="text-sm text-gray-600"
                >
                  {{ event.locationCity }}<span v-if="event.locationState">, {{ event.locationState }}</span>
                </p>
              </div>
            </div>

            <!-- Price + Age — icon-labeled row -->
            <div
              v-if="event.coverCharge || formattedAgeRestriction"
              class="flex items-center gap-4 text-sm"
            >
              <div
                v-if="event.coverCharge"
                class="flex items-center gap-1.5 text-gray-700"
              >
                <UIcon
                  name="i-heroicons-ticket"
                  class="w-4 h-4 text-gray-400"
                />
                <span class="font-semibold">{{ event.coverCharge }}</span>
              </div>
              <div
                v-if="event.coverCharge && formattedAgeRestriction"
                class="w-px h-4 bg-gray-300"
              />
              <div
                v-if="formattedAgeRestriction"
                class="flex items-center gap-1.5 text-gray-700"
              >
                <UIcon
                  name="i-heroicons-user"
                  class="w-4 h-4 text-gray-400"
                />
                <span>{{ formattedAgeRestriction }}</span>
              </div>
            </div>

            <!-- Attendance counts -->
            <p
              v-if="interestedCount > 0 || goingCount > 0"
              class="text-xs text-gray-600 pl-8"
            >
              <template v-if="interestedCount > 0">
                {{ interestedCount }} interested
              </template>
              <template v-if="interestedCount > 0 && goingCount > 0">
                ·
              </template>
              <template v-if="goingCount > 0">
                {{ goingCount }} going
              </template>
            </p>
          </div>

          <!-- ============================================ -->
          <!-- ACTION ZONE: Primary CTA + attendance -->
          <!-- ============================================ -->
          <div class="space-y-3">
            <!-- Primary CTA: Get Tickets (full-width when available) -->
            <a
              v-if="event.ticketUrl"
              :href="event.ticketUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center justify-center gap-2 w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-colors text-center"
            >
              <UIcon
                name="i-heroicons-ticket"
                class="w-5 h-5"
              />
              Get Tickets
            </a>

            <!-- Attendance + secondary links row -->
            <div class="flex items-center justify-between gap-3">
              <EventAttendanceButtons
                :event-id="event.id"
                show-labels
                :interested-count="interestedCount"
                :going-count="goingCount"
                @update="onAttendanceUpdate"
              />
              <div class="flex items-center gap-1">
                <UButton
                  v-if="event.sourceUrl"
                  :href="event.sourceUrl"
                  target="_blank"
                  color="neutral"
                  variant="ghost"
                  icon="i-heroicons-arrow-top-right-on-square"
                  size="xs"
                  external
                >
                  Source
                </UButton>
                <button
                  class="text-xs text-gray-500 hover:text-gray-700 transition-colors px-2 py-1"
                  @click="reportModalOpen = true"
                >
                  Report
                </button>
              </div>
            </div>
          </div>

          <!-- ============================================ -->
          <!-- CONTENT ZONE: Description, Lineup, Press -->
          <!-- ============================================ -->
          <div
            v-if="(sanitizedDescriptionHtml || event.description) || event.eventArtists?.length || canEdit || artistReviews.length"
            class="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200 overflow-hidden"
          >
            <!-- Description / About -->
            <div
              v-if="sanitizedDescriptionHtml || event.description"
              class="p-4 sm:p-5"
            >
              <h2 class="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">
                About
              </h2>
              <!-- eslint-disable vue/no-v-html -->
              <div
                v-if="sanitizedDescriptionHtml && shouldUseHtml"
                class="prose prose-gray max-w-none"
              >
                <div
                  class="html-content-container"
                  v-html="sanitizedDescriptionHtml"
                />
                <!-- eslint-enable vue/no-v-html -->
                <button
                  v-if="hasLongDescription"
                  class="text-primary-600 hover:text-primary-700 font-medium mt-3 flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                  :aria-expanded="descriptionExpanded"
                  @click="descriptionExpanded = !descriptionExpanded"
                >
                  <UIcon
                    :name="descriptionExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                    class="w-4 h-4"
                    aria-hidden="true"
                  />
                  {{ descriptionExpanded ? 'Show less' : 'Show more' }}
                </button>
              </div>
              <div
                v-else
                class="text-gray-700 whitespace-pre-line leading-relaxed"
              >
                <template v-if="!descriptionExpanded">
                  {{ truncatedDescription }}
                </template>
                <template v-else>
                  {{ event.description }}
                </template>
                <button
                  v-if="hasLongDescription"
                  class="text-primary-600 hover:text-primary-700 font-medium mt-3 flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                  :aria-expanded="descriptionExpanded"
                  @click="descriptionExpanded = !descriptionExpanded"
                >
                  <UIcon
                    :name="descriptionExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                    class="w-4 h-4"
                    aria-hidden="true"
                  />
                  {{ descriptionExpanded ? 'Show less' : 'Show more' }}
                </button>
              </div>
            </div>

            <!-- Artist Lineup -->
            <div
              v-if="event.eventArtists?.length || canEdit"
              class="p-4 sm:p-5"
            >
              <h2 class="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">
                Lineup
              </h2>

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
                class="space-y-1"
              >
                <div
                  v-for="(ea, index) in event.eventArtists"
                  :key="ea.artist.id"
                  class="flex items-center justify-between gap-2 py-1.5 -mx-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <NuxtLink
                      :to="`/artists/${ea.artist.slug}`"
                      :class="[
                        'truncate hover:text-primary-600 transition-colors',
                        index === 0 && event.eventArtists.length > 1
                          ? 'text-lg font-bold text-gray-900'
                          : 'font-medium text-gray-700'
                      ]"
                    >
                      {{ ea.artist.name }}
                    </NuxtLink>
                    <a
                      v-if="ea.artist.spotifyId && ['AUTO_MATCHED', 'VERIFIED'].includes(ea.artist.spotifyMatchStatus)"
                      :href="`https://open.spotify.com/artist/${ea.artist.spotifyId}`"
                      target="_blank"
                      class="text-[#1DB954] hover:text-[#1ed760] flex-shrink-0"
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
            </div>

            <!-- Artist Reviews / Press -->
            <div
              v-if="artistReviews.length"
              class="p-4 sm:p-5"
            >
              <h2 class="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">
                Press
              </h2>

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
                    <span v-if="ar.review.publishedAt">·</span>
                    <time
                      v-if="ar.review.publishedAt"
                      :datetime="ar.review.publishedAt"
                    >
                      {{ new Date(ar.review.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                    </time>
                    <span>·</span>
                    <span class="text-gray-400">{{ ar.artistName }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div><!-- /content zone card -->
        </div>
      </div>

      <!-- Back -->
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
                    base: 'bg-gray-100 text-gray-700'
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

    <!-- Report Modal -->
    <EventReportModal
      v-if="event"
      v-model:open="reportModalOpen"
      :event-id="event.id"
      :event-title="event.title"
    />
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

/* Fix Squarespace aspect ratio hack that causes extra whitespace */
.html-content-container :deep(.has-aspect-ratio),
.html-content-container :deep([style*="padding-bottom"]) {
  padding-bottom: 0 !important;
  height: auto !important;
}

.html-content-container :deep(.sqs-image-shape-container-element) {
  position: static !important;
  padding-bottom: 0 !important;
}

.html-content-container :deep(.image-block-wrapper) {
  position: static !important;
}

.html-content-container :deep(figure img) {
  position: static !important;
  height: auto !important;
  max-height: 24rem;
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
