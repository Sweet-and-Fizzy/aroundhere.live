<script setup lang="ts">
import { CalendarDate, today, getLocalTimeZone } from '@internationalized/date'

const emit = defineEmits<{
  filter: [filters: Record<string, any>]
}>()

const props = defineProps<{
  venues?: { id: string; name: string }[]
  genres?: string[]
}>()

// Date range state - default to 'month' for more events
const datePreset = ref('month')
const customDateRange = ref<{ start: CalendarDate; end: CalendarDate } | undefined>(undefined)
const showCalendar = ref(false)

const selectedVenue = ref<{ label: string; value: string } | null>(null)
const searchQuery = ref('')
const selectedGenre = ref<{ label: string; value: string } | null>(null)
const selectedEventType = ref<{ label: string; value: string } | null>(null)

// Event type options - includes common non-music events
const eventTypeItems = [
  { label: 'All Events', value: '' },
  { label: 'Music Only', value: 'MUSIC' },
  { label: 'DJ Sets', value: 'DJ' },
  { label: 'Open Mic', value: 'OPEN_MIC' },
  { label: 'Comedy', value: 'COMEDY' },
  { label: 'Theater', value: 'THEATER' },
  { label: 'Trivia', value: 'TRIVIA' },
  { label: 'Karaoke', value: 'KARAOKE' },
]

const datePresets = [
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This Weekend', value: 'weekend' },
  { label: 'Next 7 Days', value: 'week' },
  { label: 'Next 30 Days', value: 'month' },
  { label: 'All Upcoming', value: 'all' },
]

const venueItems = computed(() => [
  { label: 'All Venues', value: '' },
  ...(props.venues
    ?.map(v => ({ label: v.name, value: v.id }))
    .sort((a, b) => a.label.localeCompare(b.label)) ?? []),
])

const genreItems = computed(() => [
  { label: 'All Genres', value: '' },
  ...(props.genres?.map(g => ({ label: g, value: g })) ?? []),
])

// Get today's CalendarDate
const todayDate = computed(() => today(getLocalTimeZone()))

// Display label for date selection
const dateDisplayLabel = computed(() => {
  if (datePreset.value === 'custom' && customDateRange.value) {
    const start = customDateRange.value.start
    const end = customDateRange.value.end
    const startStr = `${start.month}/${start.day}`
    const endStr = `${end.month}/${end.day}`
    return `${startStr} - ${endStr}`
  }
  return datePresets.find(p => p.value === datePreset.value)?.label || 'Select Date'
})

function getDateRange(range: string) {
  const now = new Date()
  const startDate = new Date(now)
  startDate.setHours(0, 0, 0, 0)

  let endDate: Date | undefined

  switch (range) {
    case 'today':
      endDate = new Date(startDate)
      endDate.setHours(23, 59, 59, 999)
      break
    case 'tomorrow':
      startDate.setDate(startDate.getDate() + 1)
      endDate = new Date(startDate)
      endDate.setHours(23, 59, 59, 999)
      break
    case 'weekend':
      const dayOfWeek = now.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
        // Already weekend
      } else {
        const daysUntilFriday = 5 - dayOfWeek
        startDate.setDate(now.getDate() + daysUntilFriday)
      }
      const endDayOfWeek = startDate.getDay()
      const daysUntilSunday = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + daysUntilSunday)
      endDate.setHours(23, 59, 59, 999)
      break
    case 'week':
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)
      break
    case 'month':
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 30)
      break
    case 'custom':
      if (customDateRange.value) {
        const start = customDateRange.value.start
        const end = customDateRange.value.end
        return {
          startDate: new Date(start.year, start.month - 1, start.day).toISOString(),
          endDate: new Date(end.year, end.month - 1, end.day, 23, 59, 59, 999).toISOString(),
        }
      }
      break
    case 'all':
      // No end date
      break
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate?.toISOString(),
  }
}

function applyFilters() {
  const { startDate, endDate } = getDateRange(datePreset.value)

  // Determine musicOnly based on event type selection
  // If "All Events" is selected (empty value), show all including non-music
  // Otherwise, the API defaults to music-only
  const eventTypeValue = selectedEventType.value?.value
  const musicOnly = eventTypeValue === '' ? false : undefined

  emit('filter', {
    startDate,
    endDate,
    venueId: selectedVenue.value?.value || undefined,
    q: searchQuery.value || undefined,
    genres: selectedGenre.value?.value ? [selectedGenre.value.value] : undefined,
    eventType: eventTypeValue || undefined,
    musicOnly,
  })
}

// Watch for complete range selection (both start and end dates selected)
watch(customDateRange, (newRange) => {
  if (newRange?.start && newRange?.end) {
    datePreset.value = 'custom'
    applyFilters()
  }
}, { deep: true })

function selectDatePreset(preset: string) {
  datePreset.value = preset
  showCalendar.value = false
  applyFilters()
}

function closeCalendar() {
  showCalendar.value = false
}

// Auto-apply on changes
watch([selectedVenue, selectedGenre, selectedEventType], () => {
  applyFilters()
})

// Debounce search input
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(applyFilters, 300)
})

// Initial filter application
onMounted(() => {
  applyFilters()
})
</script>

<template>
  <UCard class="mb-4 sm:mb-6">
    <div class="flex flex-col gap-3 sm:gap-4">
      <!-- Search -->
      <div class="w-full">
        <UInput
          v-model="searchQuery"
          placeholder="Search events, artists..."
          icon="i-heroicons-magnifying-glass"
          size="md"
          class="sm:text-base"
        />
      </div>

      <!-- Filters - Grid on mobile, flex row on larger screens -->
      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:gap-3">
        <!-- Date Filter with Popover Calendar -->
        <UPopover v-model:open="showCalendar" class="col-span-2 sm:col-span-1">
          <UButton
            color="neutral"
            variant="outline"
            class="w-full justify-between text-sm sm:text-base"
            trailing-icon="i-heroicons-chevron-down"
          >
            <UIcon name="i-heroicons-calendar" class="w-4 h-4 mr-1.5 sm:mr-2" />
            <span class="truncate">{{ dateDisplayLabel }}</span>
          </UButton>

          <template #content>
            <div class="p-3 space-y-3 w-[calc(100vw-2rem)] max-w-80">
              <!-- Quick presets -->
              <div class="flex flex-wrap gap-1.5 sm:gap-2">
                <button
                  v-for="preset in datePresets"
                  :key="preset.value"
                  class="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm rounded-md transition-colors"
                  :class="datePreset === preset.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'"
                  @click="selectDatePreset(preset.value)"
                >
                  {{ preset.label }}
                </button>
              </div>

              <div class="border-t pt-3">
                <p class="text-sm text-gray-500 mb-2">Or select a custom date range:</p>
                <p class="text-xs text-gray-400 mb-2">Click a start date, then click an end date</p>
                <UCalendar
                  v-model="customDateRange"
                  range
                  :min-value="todayDate"
                  :number-of-months="1"
                />
                <p v-if="customDateRange?.start && customDateRange?.end" class="text-xs text-primary-600 mt-2 font-medium">
                  Selected: {{ customDateRange.start.month }}/{{ customDateRange.start.day }} - {{ customDateRange.end.month }}/{{ customDateRange.end.day }}
                </p>
                <p v-else-if="customDateRange?.start" class="text-xs text-gray-500 mt-2">
                  Start: {{ customDateRange.start.month }}/{{ customDateRange.start.day }} - now click an end date
                </p>
              </div>

              <div class="flex justify-end">
                <UButton size="sm" @click="closeCalendar">Done</UButton>
              </div>
            </div>
          </template>
        </UPopover>

        <!-- Venue Filter -->
        <div v-if="venues?.length" class="col-span-1 sm:w-48">
          <USelectMenu
            v-model="selectedVenue"
            :items="venueItems"
            placeholder="Venue"
            class="w-full"
          >
            <template #leading>
              <UIcon name="i-heroicons-map-pin" class="w-4 h-4" />
            </template>
          </USelectMenu>
        </div>

        <!-- Genre Filter -->
        <div v-if="genres?.length" class="col-span-1 sm:w-44">
          <USelectMenu
            v-model="selectedGenre"
            :items="genreItems"
            placeholder="Genre"
            class="w-full"
          >
            <template #leading>
              <UIcon name="i-heroicons-musical-note" class="w-4 h-4" />
            </template>
          </USelectMenu>
        </div>

        <!-- Event Type Filter -->
        <div class="col-span-1 sm:w-40">
          <USelectMenu
            v-model="selectedEventType"
            :items="eventTypeItems"
            placeholder="Event Type"
            class="w-full"
          >
            <template #leading>
              <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
            </template>
          </USelectMenu>
        </div>
      </div>
    </div>
  </UCard>
</template>
