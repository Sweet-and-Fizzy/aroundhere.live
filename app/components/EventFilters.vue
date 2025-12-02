<script setup lang="ts">
import { today, getLocalTimeZone } from '@internationalized/date'
import type { DateRange } from 'reka-ui'

type CalendarDateRange = DateRange | any

const emit = defineEmits<{
  filter: [filters: Record<string, any>]
}>()

const props = defineProps<{
  venues?: { id: string; name: string }[]
  genres?: string[]
  genreLabels?: Record<string, string>
}>()

// LocalStorage key for persisting filters
const STORAGE_KEY = 'eventFilters'

// Load saved filters from localStorage
function loadSavedFilters() {
  if (import.meta.client) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null
}

// Save filters to localStorage
function saveFilters() {
  if (import.meta.client) {
    const filters = {
      datePreset: datePreset.value,
      selectedVenues: selectedVenues.value,
      selectedGenre: selectedGenre.value,
      selectedEventTypes: selectedEventTypes.value,
      searchQuery: searchQuery.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  }
}

const savedFilters = loadSavedFilters()

// Date range state - default to 'month' for more events
const datePreset = ref(savedFilters?.datePreset || 'month')
const customDateRange = ref<CalendarDateRange | undefined>(undefined)
const showCalendar = ref(false)

// Multi-select for venues
const selectedVenues = ref<{ label: string; value: string }[]>(savedFilters?.selectedVenues || [])
const searchQuery = ref(savedFilters?.searchQuery || '')
const selectedGenre = ref<{ label: string; value: string } | undefined>(savedFilters?.selectedGenre || undefined)
// Multi-select for event types - default to Music
const selectedEventTypes = ref<{ label: string; value: string }[]>(
  savedFilters?.selectedEventTypes || [{ label: 'Music', value: 'MUSIC' }]
)

// Event type options - includes common non-music events
const eventTypeItems = [
  { label: 'Music', value: 'MUSIC' },
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

const venueItems = computed(() =>
  (props.venues
    ?.map(v => ({ label: v.name, value: v.id }))
    .sort((a, b) => a.label.localeCompare(b.label)) ?? [])
)

const genreItems = computed(() => [
  { label: 'All Genres', value: '' },
  ...(props.genres?.map(g => ({
    label: props.genreLabels?.[g] || g.charAt(0).toUpperCase() + g.slice(1),
    value: g
  })) ?? []),
])

// Get today's CalendarDate
const todayDate = computed(() => today(getLocalTimeZone()))

// Display label for date selection
const dateDisplayLabel = computed(() => {
  if (datePreset.value === 'custom' && customDateRange.value) {
    const start = customDateRange.value.start
    const end = customDateRange.value.end
    if (start && end) {
      const startStr = `${start.month}/${start.day}`
      const endStr = `${end.month}/${end.day}`
      return `${startStr} - ${endStr}`
    }
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
    case 'weekend': {
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
    }
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
        if (start && end) {
          return {
            startDate: new Date(start.year, start.month - 1, start.day).toISOString(),
            endDate: new Date(end.year, end.month - 1, end.day, 23, 59, 59, 999).toISOString(),
          }
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

  // Get venue IDs from multi-select
  const venueIds = selectedVenues.value.map(v => v.value).filter(Boolean)

  // Get event types from multi-select
  const eventTypes = selectedEventTypes.value.map(e => e.value).filter(Boolean)

  // If no event types selected, show all events (including non-music)
  const musicOnly = eventTypes.length === 0 ? false : undefined

  emit('filter', {
    startDate,
    endDate,
    venueIds: venueIds.length > 0 ? venueIds : undefined,
    q: searchQuery.value || undefined,
    genres: selectedGenre.value?.value ? [selectedGenre.value.value] : undefined,
    eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
    musicOnly,
  })

  // Save filters to localStorage
  saveFilters()
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
watch([selectedVenues, selectedGenre, selectedEventTypes], () => {
  applyFilters()
}, { deep: true })

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
      <!-- Row 1: Search + Venue + Event Type -->
      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:gap-3">
        <!-- Search -->
        <div class="col-span-2 sm:flex-1">
          <UInput
            v-model="searchQuery"
            placeholder="Search events, artists..."
            icon="i-heroicons-magnifying-glass"
            size="md"
            class="w-full sm:text-base"
            :ui="{ base: 'text-gray-900 border-gray-400' }"
          />
        </div>

        <!-- Venue Filter (Multi-select) -->
        <div
          v-if="venues?.length"
          class="col-span-1 sm:w-44"
        >
          <USelectMenu
            v-model="selectedVenues"
            :items="venueItems"
            multiple
            :placeholder="selectedVenues.length ? `${selectedVenues.length} venues` : 'Venues'"
            class="w-full filter-select"
            :ui="{ base: 'text-gray-900 border-gray-400', content: 'w-64' }"
          >
            <template #leading>
              <UIcon
                name="i-heroicons-map-pin"
                class="w-4 h-4 text-gray-700"
              />
            </template>
          </USelectMenu>
        </div>

        <!-- Event Type Filter (Multi-select) -->
        <div class="col-span-1 sm:w-40">
          <USelectMenu
            v-model="selectedEventTypes"
            :items="eventTypeItems"
            multiple
            :placeholder="selectedEventTypes.length ? `${selectedEventTypes.length} types` : 'Event Types'"
            class="w-full filter-select"
            :ui="{ base: 'text-gray-900 border-gray-400' }"
          >
            <template #leading>
              <UIcon
                name="i-heroicons-sparkles"
                class="w-4 h-4 text-gray-700"
              />
            </template>
          </USelectMenu>
        </div>
      </div>

      <!-- Row 2: Date + Genre -->
      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:gap-3">
        <!-- Date Filter with Popover Calendar -->
        <UPopover
          v-model:open="showCalendar"
          class="col-span-1"
        >
          <UButton
            color="neutral"
            variant="outline"
            class="w-full justify-between text-sm sm:text-base"
            trailing-icon="i-heroicons-chevron-down"
          >
            <UIcon
              name="i-heroicons-calendar"
              class="w-4 h-4 mr-1.5 sm:mr-2"
            />
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
                <p class="text-sm text-gray-500 mb-2">
                  Or select a custom date range:
                </p>
                <p class="text-xs text-gray-400 mb-2">
                  Click a start date, then click an end date
                </p>
                <UCalendar
                  v-model="customDateRange"
                  range
                  :min-value="todayDate"
                  :number-of-months="1"
                />
                <p
                  v-if="customDateRange?.start && customDateRange?.end"
                  class="text-xs text-primary-600 mt-2 font-medium"
                >
                  Selected: {{ customDateRange.start.month }}/{{ customDateRange.start.day }} - {{ customDateRange.end.month }}/{{ customDateRange.end.day }}
                </p>
                <p
                  v-else-if="customDateRange?.start"
                  class="text-xs text-gray-500 mt-2"
                >
                  Start: {{ customDateRange.start.month }}/{{ customDateRange.start.day }} - now click an end date
                </p>
              </div>

              <div class="flex justify-end">
                <UButton
                  size="sm"
                  @click="closeCalendar"
                >
                  Done
                </UButton>
              </div>
            </div>
          </template>
        </UPopover>

        <!-- Genre Filter -->
        <div
          v-if="genres?.length"
          class="col-span-1 sm:w-48"
        >
          <USelectMenu
            v-model="selectedGenre"
            :items="genreItems"
            placeholder="Genre"
            class="w-full filter-select"
            :ui="{ base: 'text-gray-900 border-gray-400', content: 'w-64' }"
          >
            <template #leading>
              <UIcon
                name="i-heroicons-musical-note"
                class="w-4 h-4 text-gray-700"
              />
            </template>
          </USelectMenu>
        </div>
      </div>
    </div>
  </UCard>
</template>

<style scoped>
/* Force darker text and borders on form controls */
:deep(input),
:deep(button[role="combobox"]),
:deep([data-part="trigger"]) {
  color: #111827 !important;
  border-color: #9ca3af !important;
}

:deep(input::placeholder) {
  color: #111827 !important;
}

/* Make select trigger text darker */
:deep(.filter-select button span) {
  color: #111827 !important;
}
</style>
