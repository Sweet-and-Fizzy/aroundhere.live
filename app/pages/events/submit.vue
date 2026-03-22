<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
})

const toast = useToast()
const router = useRouter()
const route = useRoute()

const submitting = ref(false)
const editId = computed(() => route.query.edit as string | undefined)
const isEditMode = computed(() => !!editId.value)
const editVenueName = ref<string | null>(null)
const editReviewStatus = ref<string | null>(null)
const loadingEdit = ref(false)
const imagePreviewError = ref(false)
const uploadingImage = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const form = reactive({
  title: '',
  date: '',
  showTime: '',
  doorsTime: '',
  venueId: null as string | null,
  locationName: '',
  locationAddress: '',
  locationLat: null as number | null,
  locationLng: null as number | null,
  coverCharge: '',
  ageRestriction: 'ALL_AGES',
  ticketUrl: '',
  description: '',
  imageUrl: '',
  sourceUrl: '',
  artists: [] as Array<{ id?: string; name: string }>,
  repeat: {
    enabled: false,
    frequency: 'weekly' as 'weekly' | 'biweekly',
    count: 4,
  },
})

const ageRestrictionOptions = [
  { label: 'All Ages', value: 'ALL_AGES' },
  { label: '18+', value: 'EIGHTEEN_PLUS' },
  { label: '21+', value: 'TWENTY_ONE_PLUS' },
]

const isValid = computed(() => {
  return form.title.trim() && form.date && form.showTime && (form.venueId || form.locationName.trim())
})

// Load existing submission for edit mode
async function loadSubmission() {
  if (!editId.value) return

  loadingEdit.value = true
  try {
    const data = await $fetch(`/api/events/${editId.value}/submission`) as any
    form.title = data.title
    form.date = data.date
    form.showTime = data.showTime
    form.doorsTime = data.doorsTime
    form.venueId = data.venueId
    form.locationName = data.locationName
    form.locationAddress = data.locationAddress
    form.locationLat = data.locationLat
    form.locationLng = data.locationLng
    form.coverCharge = data.coverCharge
    form.ageRestriction = data.ageRestriction
    form.ticketUrl = data.ticketUrl
    form.description = data.description
    form.imageUrl = data.imageUrl
    form.sourceUrl = data.sourceUrl
    form.artists = data.artists || []
    editVenueName.value = data.venueName
    editReviewStatus.value = data.reviewStatus || null
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to load submission',
      color: 'error',
    })
    router.push('/my-events')
  } finally {
    loadingEdit.value = false
  }
}

if (editId.value) {
  loadSubmission()
}

watch(() => form.imageUrl, () => {
  imagePreviewError.value = false
})

// Image upload
async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // Reset input so same file can be re-selected
  target.value = ''

  uploadingImage.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)

    const result = await $fetch<{ url: string }>('/api/uploads/image', {
      method: 'POST',
      body: formData,
    })

    form.imageUrl = result.url
    toast.add({ title: 'Image uploaded', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: 'Upload failed',
      description: error.data?.message || 'Failed to upload image',
      color: 'error',
    })
  } finally {
    uploadingImage.value = false
  }
}

// Recurring event date preview
const recurringDates = computed(() => {
  if (!form.repeat.enabled || !form.date) return []
  const dates: string[] = []
  const baseDate = new Date(`${form.date}T00:00:00`)
  const days = form.repeat.frequency === 'biweekly' ? 14 : 7

  for (let i = 0; i < form.repeat.count; i++) {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + i * days)
    dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  }
  return dates
})

async function handleSubmit() {
  if (!isValid.value) return

  submitting.value = true
  try {
    if (isEditMode.value) {
      const result = await $fetch(`/api/events/${editId.value}/submission`, {
        method: 'PATCH',
        body: {
          title: form.title,
          date: form.date,
          showTime: form.showTime,
          doorsTime: form.doorsTime || undefined,
          coverCharge: form.coverCharge || undefined,
          ageRestriction: form.ageRestriction,
          ticketUrl: form.ticketUrl || undefined,
          description: form.description || undefined,
          imageUrl: form.imageUrl || undefined,
          sourceUrl: form.sourceUrl || undefined,
          artists: form.artists,
        },
      })

      if ((result as any).resubmitted) {
        toast.add({
          title: 'Changes saved — re-review required',
          description: 'Your event has been resubmitted for review because of major changes.',
          color: 'warning',
        })
        router.push('/my-events')
      } else {
        toast.add({
          title: 'Changes saved',
          description: 'Your event has been updated.',
          color: 'success',
        })
        router.push(`/events/${(result as any).event.slug}`)
      }
    } else {
      const submitBody: Record<string, any> = {
        title: form.title,
        date: form.date,
        showTime: form.showTime,
        doorsTime: form.doorsTime || undefined,
        venueId: form.venueId || undefined,
        locationName: form.locationName || undefined,
        locationAddress: form.locationAddress || undefined,
        locationLat: form.locationLat || undefined,
        locationLng: form.locationLng || undefined,
        coverCharge: form.coverCharge || undefined,
        ageRestriction: form.ageRestriction,
        ticketUrl: form.ticketUrl || undefined,
        description: form.description || undefined,
        imageUrl: form.imageUrl || undefined,
        sourceUrl: form.sourceUrl || undefined,
        artists: form.artists.length > 0 ? form.artists : undefined,
      }

      if (form.repeat.enabled && form.repeat.count >= 2) {
        submitBody.repeat = {
          frequency: form.repeat.frequency,
          count: form.repeat.count,
        }
      }

      const result = await $fetch('/api/events/submit', {
        method: 'POST',
        body: submitBody,
      }) as any

      if (result.events && result.events.length > 1) {
        toast.add({
          title: `${result.events.length} events submitted`,
          description: `${result.events.length} recurring events have been submitted for review.`,
          color: 'success',
        })
      } else {
        toast.add({
          title: 'Event submitted',
          description: 'Your event has been submitted for review.',
          color: 'success',
        })
      }

      router.push(`/events/${result.event.slug}`)
    }
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to submit event',
      color: 'error',
    })
  } finally {
    submitting.value = false
  }
}

useSeoMeta({
  title: isEditMode.value ? 'Edit Submission - AroundHere' : 'Submit an Event - AroundHere',
  description: 'Submit an event to be listed on AroundHere',
})
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-gray-900 mb-2">
      {{ isEditMode ? 'Edit Submission' : 'Submit an Event' }}
    </h1>
    <p class="text-gray-600 mb-6">
      {{ isEditMode ? 'Update your event.' : 'Add an event to AroundHere. Submissions are reviewed before appearing publicly.' }}
    </p>

    <!-- Info banner for new submissions -->
    <div
      v-if="!isEditMode"
      class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex gap-3"
    >
      <UIcon
        name="i-heroicons-information-circle"
        class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"
      />
      <div class="text-sm text-blue-800">
        <p class="font-medium mb-1">
          How submissions work
        </p>
        <p>Events are reviewed by our team before going live, usually within 24 hours. You'll receive an email when your event is approved.</p>
      </div>
    </div>

    <!-- Info banner for editing approved events -->
    <div
      v-if="isEditMode && editReviewStatus === 'APPROVED'"
      class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex gap-3"
    >
      <UIcon
        name="i-heroicons-exclamation-triangle"
        class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
      />
      <div class="text-sm text-amber-800">
        <p class="font-medium mb-1">
          Editing a live event
        </p>
        <p>Minor changes (description, links, cover charge) will update immediately. Changing the title, date/time, or artists will require re-review.</p>
      </div>
    </div>

    <div
      v-if="loadingEdit"
      class="flex justify-center py-12"
    >
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-6 h-6 animate-spin text-gray-400"
      />
    </div>

    <form
      v-else
      class="space-y-6"
      @submit.prevent="handleSubmit"
    >
      <!-- Event Details -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-musical-note"
              class="w-4 h-4 text-gray-500"
            />
            <span class="font-semibold">Event Details</span>
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Event Title <span class="text-red-500">*</span>
            </label>
            <UInput
              v-model="form.title"
              placeholder="e.g., Jazz Night with The Quartet"
              size="sm"
            />
            <p class="text-xs text-gray-500 mt-1">
              Include the artist or band name if applicable.
            </p>
          </div>

          <!-- Artists -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Artists</label>
            <ArtistSearchInput v-model="form.artists" />
            <p class="text-xs text-gray-500 mt-1">
              Add performing artists. The first artist is considered the headliner.
            </p>
          </div>

          <!-- Date and Times -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Date <span class="text-red-500">*</span>
              </label>
              <UInput
                v-model="form.date"
                type="date"
                size="sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Show Time <span class="text-red-500">*</span>
              </label>
              <UInput
                v-model="form.showTime"
                type="time"
                size="sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Doors Time</label>
              <UInput
                v-model="form.doorsTime"
                type="time"
                size="sm"
              />
            </div>
          </div>

          <!-- Recurring Events (only in create mode) -->
          <div v-if="!isEditMode">
            <div class="flex items-center gap-3">
              <USwitch
                v-model="form.repeat.enabled"
              />
              <span class="text-sm font-medium text-gray-700">This is a recurring event</span>
            </div>

            <div
              v-if="form.repeat.enabled"
              class="mt-3 pl-1 space-y-3"
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                  <USelect
                    v-model="form.repeat.frequency"
                    size="sm"
                    :items="[
                      { label: 'Weekly', value: 'weekly' },
                      { label: 'Every 2 Weeks', value: 'biweekly' },
                    ]"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Number of events</label>
                  <UInput
                    v-model.number="form.repeat.count"
                    type="number"
                    :min="2"
                    :max="8"
                    size="sm"
                  />
                </div>
              </div>

              <div
                v-if="recurringDates.length > 0"
                class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3"
              >
                This will create <strong>{{ recurringDates.length }} events</strong>:
                {{ recurringDates.join(', ') }}
              </div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <UTextarea
              v-model="form.description"
              placeholder="Tell people about this event..."
              :rows="4"
              size="sm"
            />
            <p class="text-xs text-gray-500 mt-1">
              Describe the event, performers, genre, or anything attendees should know.
            </p>
          </div>
        </div>
      </UCard>

      <!-- Venue / Location -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-map-pin"
              class="w-4 h-4 text-gray-500"
            />
            <span class="font-semibold">Location <span class="text-red-500">*</span></span>
          </div>
        </template>

        <!-- In edit mode, show venue as read-only -->
        <div v-if="isEditMode && (editVenueName || form.locationName)">
          <label class="block text-sm font-medium text-gray-700 mb-1">Venue</label>
          <UInput
            :model-value="editVenueName || form.locationName"
            disabled
            size="sm"
          />
          <p class="text-xs text-gray-500 mt-1">
            Venue cannot be changed after submission. If needed, submit a new event instead.
          </p>
        </div>

        <VenueAutocomplete
          v-else
          @update:venue-id="form.venueId = $event"
          @update:location-name="form.locationName = $event"
          @update:location-address="form.locationAddress = $event"
          @update:location-lat="form.locationLat = $event"
          @update:location-lng="form.locationLng = $event"
        />
      </UCard>

      <!-- Links & Media -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-link"
              class="w-4 h-4 text-gray-500"
            />
            <span class="font-semibold">Links & Media</span>
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Event Page URL</label>
            <UInput
              v-model="form.sourceUrl"
              placeholder="https://example.com/events/my-event"
              type="url"
              size="sm"
            />
            <p class="text-xs text-gray-500 mt-1">
              Link to the official event page, Facebook event, or listing.
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Ticket URL</label>
            <UInput
              v-model="form.ticketUrl"
              placeholder="https://..."
              type="url"
              size="sm"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Event Image</label>

            <!-- Upload button + hidden file input -->
            <div class="flex items-center gap-3 mb-2">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-heroicons-arrow-up-tray"
                :loading="uploadingImage"
                @click="fileInputRef?.click()"
              >
                Upload Image
              </UButton>
              <span class="text-sm text-gray-500">or paste a URL below</span>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                class="hidden"
                @change="handleFileUpload"
              >
            </div>

            <UInput
              v-model="form.imageUrl"
              placeholder="https://example.com/image.jpg"
              type="url"
              size="sm"
            />
            <p class="text-xs text-gray-500 mt-1">
              Upload an image (max 5MB) or paste an image URL.
            </p>
          </div>

          <!-- Image preview -->
          <div
            v-if="form.imageUrl && !imagePreviewError"
            class="mt-2"
          >
            <p class="text-xs text-gray-500 mb-1">
              Preview:
            </p>
            <img
              :src="form.imageUrl"
              alt="Event image preview"
              class="max-h-48 rounded-lg border border-gray-200 object-cover"
              @error="imagePreviewError = true"
            >
          </div>
        </div>
      </UCard>

      <!-- Additional Details -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-adjustments-horizontal"
              class="w-4 h-4 text-gray-500"
            />
            <span class="font-semibold">Additional Details</span>
          </div>
        </template>

        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Cover Charge</label>
              <UInput
                v-model="form.coverCharge"
                placeholder="e.g., $10, Free, $15-20"
                size="sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Age Restriction</label>
              <USelect
                v-model="form.ageRestriction"
                :items="ageRestrictionOptions.map(o => ({ label: o.label, value: o.value }))"
                size="sm"
              />
            </div>
          </div>
        </div>
      </UCard>

      <!-- Submit Button -->
      <div class="flex justify-end gap-3">
        <UButton
          color="neutral"
          variant="outline"
          :to="isEditMode ? '/my-events' : '/'"
        >
          Cancel
        </UButton>
        <UButton
          type="submit"
          color="primary"
          :loading="submitting"
          :disabled="!isValid"
          icon="i-heroicons-paper-airplane"
        >
          {{ isEditMode ? 'Save Changes' : 'Submit for Review' }}
        </UButton>
      </div>
    </form>
  </div>
</template>
