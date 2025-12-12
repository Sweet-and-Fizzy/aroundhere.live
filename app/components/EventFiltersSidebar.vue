<script setup lang="ts">
import { today, getLocalTimeZone } from '@internationalized/date'
import type { DateRange } from 'reka-ui'

type CalendarDateRange = DateRange | any

const emit = defineEmits<{
  filter: [filters: Record<string, any>]
}>()

const route = useRoute()
const router = useRouter()

const props = defineProps<{
  venues?: { id: string; name: string; slug: string; latitude?: number | null; longitude?: number | null }[]
  genres?: string[]
  genreLabels?: Record<string, string>
  facets?: {
    venueCounts: Record<string, number>
    genreCounts: Record<string, number>
    typeCounts: Record<string, number>
    musicCount: number
    nonMusicCount: number
  }
  resultCount?: number
}>()

// LocalStorage key for persisting filters
const STORAGE_KEY = 'eventFilters'

// Valid event types for URL validation
const validEventTypes = ['ALL_MUSIC', 'ALL_EVENTS', 'MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE', 'COMEDY', 'THEATER', 'TRIVIA']
const validDatePresets = ['today', 'tomorrow', 'weekend', 'week', 'month', 'all']

// Load filters from URL params (takes priority over localStorage)
function loadFiltersFromUrl() {
  const query = route.query
  const hasUrlFilters = query.q || query.venues || query.genres || query.types || query.date

  if (!hasUrlFilters) return null

  // Validate and filter event types to only valid values
  const urlTypes = query.types ? (query.types as string).split(',') : []
  const validatedTypes = urlTypes.filter(t => validEventTypes.includes(t))

  // Validate date preset
  const urlDate = query.date as string
  const validatedDate = validDatePresets.includes(urlDate) ? urlDate : 'month'

  return {
    searchQuery: (query.q as string) || '',
    // Venues are stored by slug in URL, we'll need to map them to IDs later
    venueSlug: query.venues ? (query.venues as string).split(',') : [],
    selectedGenres: query.genres ? (query.genres as string).split(',') : [],
    selectedEventTypes: validatedTypes.length > 0 ? validatedTypes : ['ALL_MUSIC'],
    datePreset: validatedDate,
  }
}

// Load saved filters from localStorage
function loadSavedFilters() {
  // URL params take priority
  const urlFilters = loadFiltersFromUrl()
  if (urlFilters) return urlFilters

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
      selectedVenueIds: selectedVenueIds.value,
      selectedGenres: selectedGenres.value,
      selectedEventTypes: selectedEventTypes.value,
      searchQuery: searchQuery.value,
      expandedSection: expandedSection.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  }
}

// Update URL with current filters (for shareable links)
function updateUrl() {
  if (!import.meta.client) return

  const query: Record<string, string> = {}

  // Search query
  if (searchQuery.value) {
    query.q = searchQuery.value
  }

  // Venues - use slugs for readable URLs
  if (selectedVenueIds.value.length > 0) {
    const venueSlugs = selectedVenueIds.value
      .map(id => props.venues?.find(v => v.id === id)?.slug)
      .filter(Boolean) as string[]
    if (venueSlugs.length > 0) {
      query.venues = venueSlugs.join(',')
    }
  }

  // Genres
  if (selectedGenres.value.length > 0) {
    query.genres = selectedGenres.value.join(',')
  }

  // Event types (only if not default)
  if (selectedEventTypes.value.length !== 1 || selectedEventTypes.value[0] !== 'ALL_MUSIC') {
    query.types = selectedEventTypes.value.join(',')
  }

  // Date preset (only if not default)
  if (datePreset.value !== 'month') {
    query.date = datePreset.value
  }

  // Use replace to avoid polluting browser history
  router.replace({ query })
}

const savedFilters = loadSavedFilters()

// Collapsible sections state - accordion style (only one section open at a time)
const expandedSection = ref<string | null>(
  savedFilters?.expandedSection || null
)

function toggleSection(section: string) {
  // Accordion: clicking expanded section collapses it, clicking collapsed expands it (and collapses others)
  if (expandedSection.value === section) {
    expandedSection.value = null
  } else {
    expandedSection.value = section
  }
  saveFilters()
}

function isSectionExpanded(section: string) {
  return expandedSection.value === section
}

// Date range state - default to 'month' for more events
const datePreset = ref(savedFilters?.datePreset || 'month')
const customDateRange = ref<CalendarDateRange | undefined>(undefined)
const showCustomCalendar = ref(false)

// Track if we have pending URL venue slugs to resolve
const pendingVenueSlugs = ref<string[]>(savedFilters?.venueSlug || [])

// Multi-select for venues - now stored as string array of IDs
const selectedVenueIds = ref<string[]>(
  savedFilters?.selectedVenueIds ||
  savedFilters?.selectedVenues?.map((v: any) => v.value || v) ||
  []
)
const searchQuery = ref(savedFilters?.searchQuery || '')
const selectedGenres = ref<string[]>(
  savedFilters?.selectedGenres?.map((g: any) => g.value || g) || []
)
// Event types as simple string array for checkboxes
const selectedEventTypes = ref<string[]>(
  savedFilters?.selectedEventTypes?.map((e: any) => e.value || e) || ['ALL_MUSIC']
)

// Map filter state
const mapFilteredVenueIds = ref<string[] | null>(null)
const showMap = ref(false)
const showMapModal = ref(false)
const mapCenter = ref<{ lat: number; lng: number; radius: number | 'view' } | null>(null)

// Shared localStorage key for map bounds
const MAP_BOUNDS_KEY = 'mapBounds'

// Venues with coordinates for the map
const venuesWithCoords = computed(() =>
  props.venues?.filter(v => v.latitude && v.longitude) || []
)

// Show more genres toggle
const showAllGenres = ref(false)
const INITIAL_GENRE_COUNT = 8

// Filter genres to only show those with events (count > 0) and that would actually narrow results
// Sort by event count (descending) so most popular genres appear first
const availableGenres = computed(() => {
  const genreCounts = props.facets?.genreCounts ?? {}
  const totalResults = props.resultCount ?? 0
  return (props.genres ?? [])
    .filter((g) => {
      const count = genreCounts[g] ?? 0
      // Must have events AND selecting it would actually narrow results
      // (count < totalResults means it would filter some out)
      // Also show if already selected (so user can deselect)
      return count > 0 && (count < totalResults || selectedGenres.value.includes(g))
    })
    .sort((a, b) => {
      // Sort by event count descending
      const countDiff = (genreCounts[b] ?? 0) - (genreCounts[a] ?? 0)
      if (countDiff !== 0) return countDiff
      return a.localeCompare(b)
    })
})

const visibleGenres = computed(() => {
  if (showAllGenres.value) return availableGenres.value
  return availableGenres.value.slice(0, INITIAL_GENRE_COUNT)
})

const hasMoreGenres = computed(() => availableGenres.value.length > INITIAL_GENRE_COUNT)

// Get count for a specific event type
function getTypeCount(type: string): number {
  return props.facets?.typeCounts?.[type] || 0
}

// Calculate distance between two points in miles (Haversine formula)
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function filterVenuesByRadius() {
  if (!mapCenter.value || mapCenter.value.radius === 'view') {
    return
  }

  const { lat, lng, radius } = mapCenter.value
  const venuesInRadius = venuesWithCoords.value.filter(v => {
    if (!v.latitude || !v.longitude) return false
    const distance = getDistanceMiles(lat, lng, v.latitude, v.longitude)
    return distance <= (radius as number)
  })

  mapFilteredVenueIds.value = venuesInRadius.map(v => v.id)
}

function onMapVisibleVenues(venueIds: string[]) {
  // Always update filtered venues when we receive visible venues from the map
  // This is called on initial load and whenever the map view changes
  mapFilteredVenueIds.value = venueIds
  // Clear any selected venues that are no longer visible on the map
  selectedVenueIds.value = selectedVenueIds.value.filter(id =>
    venueIds.includes(id)
  )
  applyFilters()
}

function onMapCenterChanged(center: { lat: number; lng: number; radius: number | 'view' }) {
  mapCenter.value = center
  if (center.radius === 'view') {
    // In 'view' mode, mapFilteredVenueIds will be set by onMapVisibleVenues
    // Don't clear it here - just wait for the visible venues event
  } else {
    filterVenuesByRadius()
    // Clear any selected venues that are no longer in the geographic area
    if (mapFilteredVenueIds.value !== null) {
      selectedVenueIds.value = selectedVenueIds.value.filter(id =>
        mapFilteredVenueIds.value!.includes(id)
      )
    }
    applyFilters()
  }
}

function resetMap() {
  mapFilteredVenueIds.value = null
  mapCenter.value = null
  if (import.meta.client) {
    localStorage.removeItem(MAP_BOUNDS_KEY)
  }
  showMap.value = false
  nextTick(() => {
    showMap.value = true
  })
  applyFilters()
}

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return (
    searchQuery.value !== '' ||
    selectedVenueIds.value.length > 0 ||
    selectedGenres.value.length > 0 ||
    (selectedEventTypes.value.length !== 1 || selectedEventTypes.value[0] !== 'ALL_MUSIC') ||
    datePreset.value !== 'month' ||
    mapFilteredVenueIds.value !== null
  )
})

// Count active filters for display
const activeFilterCount = computed(() => {
  let count = 0
  if (searchQuery.value !== '') count++
  if (selectedVenueIds.value.length > 0) count++
  if (selectedGenres.value.length > 0) count++
  if (selectedEventTypes.value.length !== 1 || selectedEventTypes.value[0] !== 'ALL_MUSIC') count++
  if (datePreset.value !== 'month') count++
  if (mapFilteredVenueIds.value !== null) count++
  return count
})

function resetFilters() {
  searchQuery.value = ''
  selectedVenueIds.value = []
  selectedGenres.value = []
  selectedEventTypes.value = ['ALL_MUSIC']
  datePreset.value = 'month'
  customDateRange.value = undefined
  mapFilteredVenueIds.value = null
  mapCenter.value = null
  showMapModal.value = false
  if (import.meta.client) {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(MAP_BOUNDS_KEY)
  }
  applyFilters()
}

// Music-related event types
const allMusicEventTypes = [
  { label: 'Live Music', value: 'MUSIC' },
  { label: 'DJ Sets', value: 'DJ' },
  { label: 'Open Mic', value: 'OPEN_MIC' },
  { label: 'Karaoke', value: 'KARAOKE' },
]

// Non-music event types
const allNonMusicEventTypes = [
  { label: 'Comedy', value: 'COMEDY' },
  { label: 'Theater', value: 'THEATER' },
  { label: 'Games', value: 'GAMES' },
  { label: 'Dance', value: 'DANCE' },
  { label: 'Market', value: 'MARKET' },
  { label: 'Workshop', value: 'WORKSHOP' },
  { label: 'Party', value: 'PARTY' },
  { label: 'Fitness', value: 'FITNESS' },
  { label: 'Drag', value: 'DRAG' },
]

// Filter to only show event types with events AND that would narrow results
const musicEventTypes = computed(() => {
  if (!props.facets) return allMusicEventTypes
  const totalResults = props.resultCount ?? 0
  return allMusicEventTypes.filter((t) => {
    const count = props.facets?.typeCounts?.[t.value] ?? 0
    // Show if has events AND would narrow results, OR is already selected
    return count > 0 && (count < totalResults || selectedEventTypes.value.includes(t.value))
  })
})

const nonMusicEventTypes = computed(() => {
  if (!props.facets) return allNonMusicEventTypes
  const totalResults = props.resultCount ?? 0
  return allNonMusicEventTypes.filter((t) => {
    const count = props.facets?.typeCounts?.[t.value] ?? 0
    // Show if has events AND would narrow results, OR is already selected
    return count > 0 && (count < totalResults || selectedEventTypes.value.includes(t.value))
  })
})

// Check if any music-related type is selected (for showing genre filter)
const hasMusicTypeSelected = computed(() => {
  const musicTypes = ['ALL_MUSIC', 'MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE']
  return selectedEventTypes.value.some(t => musicTypes.includes(t))
})

// Show "All Music" only if there are non-music events (so toggling between All Music/All Events matters)
// If nonMusicCount is 0, all matching results are already music, so "All Music" wouldn't change anything
const showAllMusic = computed(() => {
  const nonMusicCount = props.facets?.nonMusicCount ?? 0
  const musicCount = props.facets?.musicCount ?? 0

  // Show only if there are both music AND non-music events (so the toggle matters)
  return musicCount > 0 && nonMusicCount > 0
})

// Show "All Events" only if there are non-music events (meaning All Events differs from All Music)
const showAllEvents = computed(() => {
  const nonMusicCount = props.facets?.nonMusicCount ?? 0
  return nonMusicCount > 0
})

// Check if the entire event type section should be shown
const showEventTypeSection = computed(() => {
  return showAllMusic.value || showAllEvents.value || musicEventTypes.value.length > 0 || nonMusicEventTypes.value.length > 0
})

const datePresets = [
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This Weekend', value: 'weekend' },
  { label: 'Next 7 Days', value: 'week' },
  { label: 'Next 30 Days', value: 'month' },
  { label: 'All Upcoming', value: 'all' },
]

// Section summaries for collapsed state
const dateSummary = computed(() => {
  const preset = datePresets.find(p => p.value === datePreset.value)
  return preset?.label || 'Next 30 Days'
})

const venueSummary = computed(() => {
  if (selectedVenueIds.value.length === 0) return null
  const names = selectedVenueObjects.value.map(v => v.name)
  if (names.length === 1) return names[0]
  if (names.length === 2) return names.join(', ')
  return `${names[0]} +${names.length - 1} more`
})

const typeSummary = computed(() => {
  if (selectedEventTypes.value.length === 0) return 'All Events'
  if (selectedEventTypes.value.includes('ALL_MUSIC')) {
    if (selectedEventTypes.value.length === 1) return 'All Music'
    const nonMusic = selectedEventTypes.value.filter(t => !['ALL_MUSIC', 'MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE'].includes(t))
    if (nonMusic.length > 0) return 'All Music + more'
    return 'All Music'
  }
  if (selectedEventTypes.value.includes('ALL_NON_MUSIC')) {
    return 'Non-Music'
  }
  const allTypes = [...allMusicEventTypes, ...allNonMusicEventTypes]
  const labels = selectedEventTypes.value
    .map(t => allTypes.find(et => et.value === t)?.label)
    .filter(Boolean)
  if (labels.length <= 2) return labels.join(', ')
  return `${labels[0]} +${labels.length - 1} more`
})

const genreSummary = computed(() => {
  if (selectedGenres.value.length === 0) return null
  const labels = selectedGenres.value.map(g => props.genreLabels?.[g] || g)
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return labels.join(', ')
  return `${labels[0]} +${labels.length - 1} more`
})

// Filter venues to only show those with events (count > 0) AND within map area if set
// AND that would actually narrow results
// Sort by event count (descending) so most active venues appear first
const availableVenues = computed(() => {
  const venueCounts = props.facets?.venueCounts ?? {}
  const totalResults = props.resultCount ?? 0
  return (props.venues ?? [])
    .filter((v) => {
      // If map filter is active, only show venues in the geographic area
      if (mapFilteredVenueIds.value !== null && !mapFilteredVenueIds.value.includes(v.id)) {
        return false
      }
      const count = venueCounts[v.id] ?? 0
      // Must have events AND selecting it would actually narrow results
      // Also show if already selected (so user can deselect)
      return count > 0 && (count < totalResults || selectedVenueIds.value.includes(v.id))
    })
    .sort((a, b) => {
      // Sort by event count descending, then alphabetically
      const countDiff = (venueCounts[b.id] ?? 0) - (venueCounts[a.id] ?? 0)
      if (countDiff !== 0) return countDiff
      return a.name.localeCompare(b.name)
    })
})

// Show more venues toggle
const showAllVenues = ref(false)

// Venue search/autocomplete
const venueSearchQuery = ref('')
const showVenueDropdown = ref(false)
const venueSearchInput = ref<HTMLInputElement | null>(null)

// Filtered venues for autocomplete dropdown (excludes already selected)
const venueSearchResults = computed(() => {
  if (!venueSearchQuery.value.trim()) return []
  const query = venueSearchQuery.value.toLowerCase()
  return availableVenues.value
    .filter(v =>
      !selectedVenueIds.value.includes(v.id) &&
      v.name.toLowerCase().includes(query)
    )
    .slice(0, 6)
})

// Get selected venue objects for displaying chips
const selectedVenueObjects = computed(() => {
  return (props.venues ?? []).filter(v => selectedVenueIds.value.includes(v.id))
})

function selectVenueFromSearch(venueId: string) {
  if (!selectedVenueIds.value.includes(venueId)) {
    selectedVenueIds.value.push(venueId)
    applyFilters()
  }
  venueSearchQuery.value = ''
  showVenueDropdown.value = false
}

function removeVenue(venueId: string) {
  const index = selectedVenueIds.value.indexOf(venueId)
  if (index !== -1) {
    selectedVenueIds.value.splice(index, 1)
    applyFilters()
  }
}

function onVenueSearchFocus() {
  showVenueDropdown.value = true
}

function onVenueSearchBlur() {
  // Delay to allow click on dropdown item
  setTimeout(() => {
    showVenueDropdown.value = false
  }, 200)
}

// Toggle venue selection
function toggleVenue(venueId: string) {
  const index = selectedVenueIds.value.indexOf(venueId)
  if (index === -1) {
    selectedVenueIds.value.push(venueId)
  } else {
    selectedVenueIds.value.splice(index, 1)
  }
  applyFilters()
}

// Get venue count
function getVenueCount(venueId: string): number {
  return props.facets?.venueCounts?.[venueId] ?? 0
}

const todayDate = computed(() => today(getLocalTimeZone()))

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
      break
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate?.toISOString(),
  }
}

function applyFilters() {
  const { startDate, endDate } = getDateRange(datePreset.value)

  let venueIds: string[] | undefined
  if (selectedVenueIds.value.length > 0 && mapFilteredVenueIds.value !== null) {
    venueIds = selectedVenueIds.value.filter(id => mapFilteredVenueIds.value!.includes(id))
  } else if (selectedVenueIds.value.length > 0) {
    venueIds = selectedVenueIds.value
  } else if (mapFilteredVenueIds.value !== null) {
    venueIds = mapFilteredVenueIds.value
  }

  let eventTypes = [...selectedEventTypes.value]
  const showAllEvents = eventTypes.includes('ALL_EVENTS')

  if (!showAllEvents && eventTypes.includes('ALL_MUSIC')) {
    const otherTypes = eventTypes.filter(t => t !== 'ALL_MUSIC')
    const musicTypes = allMusicEventTypes.map(t => t.value)
    eventTypes = [...new Set([...musicTypes, ...otherTypes])]
  }

  const musicOnly = (eventTypes.length === 0 || showAllEvents) ? false : undefined

  emit('filter', {
    startDate,
    endDate,
    venueIds: venueIds && venueIds.length > 0 ? venueIds : undefined,
    q: searchQuery.value || undefined,
    genres: selectedGenres.value.length > 0 ? selectedGenres.value : undefined,
    eventTypes: (!showAllEvents && eventTypes.length > 0) ? eventTypes : undefined,
    musicOnly,
  })

  saveFilters()
  updateUrl()
}

function toggleGenre(genre: string) {
  const index = selectedGenres.value.indexOf(genre)
  if (index === -1) {
    selectedGenres.value.push(genre)
  } else {
    selectedGenres.value.splice(index, 1)
  }
  applyFilters()
}

function toggleEventType(type: string) {
  // Handle special "All" options
  if (type === 'ALL_EVENTS' || type === 'ALL_MUSIC') {
    selectedEventTypes.value = [type]
  } else {
    // Remove ALL_EVENTS and ALL_MUSIC when selecting specific types
    selectedEventTypes.value = selectedEventTypes.value.filter(t => t !== 'ALL_EVENTS' && t !== 'ALL_MUSIC')

    const index = selectedEventTypes.value.indexOf(type)
    if (index === -1) {
      selectedEventTypes.value.push(type)
    } else {
      selectedEventTypes.value.splice(index, 1)
    }

    // If nothing selected, default back to ALL_MUSIC
    if (selectedEventTypes.value.length === 0) {
      selectedEventTypes.value = ['ALL_MUSIC']
    }
  }
  applyFilters()
}

function selectDatePreset(preset: string) {
  datePreset.value = preset
  showCustomCalendar.value = false
  applyFilters()
}

// Watch for custom range selection
watch(customDateRange, (newRange) => {
  if (newRange?.start && newRange?.end) {
    datePreset.value = 'custom'
    showCustomCalendar.value = false
    applyFilters()
  }
}, { deep: true })

// Watch for venues to resolve URL slugs to IDs
watch(() => props.venues, (venues) => {
  if (venues && pendingVenueSlugs.value.length > 0) {
    const resolvedIds = pendingVenueSlugs.value
      .map(slug => venues.find(v => v.slug === slug)?.id)
      .filter(Boolean) as string[]
    if (resolvedIds.length > 0) {
      selectedVenueIds.value = resolvedIds
      pendingVenueSlugs.value = []
      applyFilters()
    }
  }
}, { immediate: true })

// Debounce search input
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(applyFilters, 300)
})

onMounted(() => {
  applyFilters()
})

// Clear filters but keep search query (for "search all events" action)
function clearFiltersKeepSearch() {
  selectedVenueIds.value = []
  selectedGenres.value = []
  selectedEventTypes.value = ['ALL_EVENTS']
  datePreset.value = 'all'
  mapFilteredVenueIds.value = null
  mapCenter.value = null
  showAllVenues.value = false
  if (import.meta.client) {
    localStorage.removeItem(MAP_BOUNDS_KEY)
  }
  saveFilters()
  applyFilters()
}

// Expose methods for parent component
defineExpose({
  resetFilters,
  clearFiltersKeepSearch,
})
</script>

<template>
  <div class="sidebar-filters">
    <!-- Search - sticky at top -->
    <div class="search-section">
      <UInput
        v-model="searchQuery"
        placeholder="Search events, artists..."
        size="sm"
        class="w-full"
        icon="i-heroicons-magnifying-glass"
      />
    </div>

    <!-- Date Range -->
    <div class="filter-section">
      <button
        class="section-header"
        @click="toggleSection('date')"
      >
        <span class="section-title">
          <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
          Date
        </span>
        <span class="section-meta">
          <span v-if="!isSectionExpanded('date')" class="section-summary">{{ dateSummary }}</span>
          <UIcon
            :name="isSectionExpanded('date') ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            class="w-4 h-4 text-gray-400"
          />
        </span>
      </button>
      <div v-if="isSectionExpanded('date')" class="section-content">
        <button
          v-for="preset in datePresets"
          :key="preset.value"
          class="radio-option"
          :class="{ active: datePreset === preset.value }"
          @click="selectDatePreset(preset.value)"
        >
          <span class="radio-dot" :class="{ checked: datePreset === preset.value }" />
          {{ preset.label }}
        </button>
        <button
          class="radio-option"
          :class="{ active: datePreset === 'custom' }"
          @click="showCustomCalendar = !showCustomCalendar"
        >
          <span class="radio-dot" :class="{ checked: datePreset === 'custom' }" />
          Custom Range
          <UIcon
            :name="showCustomCalendar ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            class="w-3 h-3 ml-auto text-gray-400"
          />
        </button>
        <div v-if="showCustomCalendar" class="calendar-wrapper">
          <UCalendar
            v-model="customDateRange"
            range
            :min-value="todayDate"
            :number-of-months="1"
          />
        </div>
      </div>
    </div>

    <!-- Venue - only show venues with events -->
    <div v-if="availableVenues.length" class="filter-section">
      <button
        class="section-header"
        @click="toggleSection('venue')"
      >
        <span class="section-title">
          <UIcon name="i-heroicons-building-storefront" class="w-4 h-4" />
          Venue
        </span>
        <span class="section-meta">
          <span v-if="!isSectionExpanded('venue') && venueSummary" class="section-summary">{{ venueSummary }}</span>
          <span v-else-if="!isSectionExpanded('venue')" class="section-summary muted">All venues</span>
          <UIcon
            :name="isSectionExpanded('venue') ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            class="w-4 h-4 text-gray-400"
          />
        </span>
      </button>
      <div v-if="isSectionExpanded('venue')" class="section-content">
        <!-- Venue search autocomplete -->
        <div class="venue-search-wrapper">
          <div class="venue-search-input-container">
            <UIcon name="i-heroicons-magnifying-glass" class="venue-search-icon" />
            <input
              ref="venueSearchInput"
              v-model="venueSearchQuery"
              type="text"
              placeholder="Search venues..."
              class="venue-search-input"
              @focus="onVenueSearchFocus"
              @blur="onVenueSearchBlur"
            >
          </div>
          <!-- Autocomplete dropdown -->
          <div v-if="showVenueDropdown && venueSearchResults.length > 0" class="venue-dropdown">
            <button
              v-for="venue in venueSearchResults"
              :key="venue.id"
              class="venue-dropdown-item"
              @mousedown.prevent="selectVenueFromSearch(venue.id)"
            >
              <span class="venue-dropdown-name">{{ venue.name }}</span>
              <span v-if="getVenueCount(venue.id)" class="option-count">
                {{ getVenueCount(venue.id) }}
              </span>
            </button>
          </div>
          <div v-else-if="showVenueDropdown && venueSearchQuery.trim() && venueSearchResults.length === 0" class="venue-dropdown">
            <div class="venue-dropdown-empty">No venues found</div>
          </div>
        </div>

        <!-- Selected venue chips -->
        <div v-if="selectedVenueObjects.length > 0" class="venue-chips">
          <TransitionGroup name="filter-list" tag="div" class="venue-chips-list">
            <span
              v-for="venue in selectedVenueObjects"
              :key="venue.id"
              class="venue-chip"
            >
              {{ venue.name }}
              <button
                class="venue-chip-remove"
                @click="removeVenue(venue.id)"
              >
                <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
              </button>
            </span>
          </TransitionGroup>
        </div>

        <!-- Browse all venues toggle -->
        <button
          class="browse-venues-btn"
          @click="showAllVenues = !showAllVenues"
        >
          <UIcon
            :name="showAllVenues ? 'i-heroicons-chevron-up' : 'i-heroicons-list-bullet'"
            class="w-4 h-4"
          />
          {{ showAllVenues ? 'Hide venue list' : 'Browse all venues' }}
        </button>

        <!-- Full venue list (collapsible) -->
        <div v-if="showAllVenues" class="venue-browse-list">
          <TransitionGroup name="filter-list" tag="div">
            <button
              v-for="venue in availableVenues"
              :key="venue.id"
              class="checkbox-option"
              :class="{ active: selectedVenueIds.includes(venue.id) }"
              @click="toggleVenue(venue.id)"
            >
              <span class="checkbox" :class="{ checked: selectedVenueIds.includes(venue.id) }" />
              <span class="option-label">{{ venue.name }}</span>
              <span v-if="getVenueCount(venue.id)" class="option-count">
                {{ getVenueCount(venue.id) }}
              </span>
            </button>
          </TransitionGroup>
        </div>
      </div>
    </div>


    <!-- Event Type -->
    <div v-if="showEventTypeSection" class="filter-section">
      <button
        class="section-header"
        @click="toggleSection('type')"
      >
        <span class="section-title">
          <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
          Event Type
        </span>
        <span class="section-meta">
          <span v-if="!isSectionExpanded('type')" class="section-summary">{{ typeSummary }}</span>
          <UIcon
            :name="isSectionExpanded('type') ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            class="w-4 h-4 text-gray-400"
          />
        </span>
      </button>
      <div v-if="isSectionExpanded('type')" class="section-content">
        <button
          v-if="showAllEvents"
          class="checkbox-option"
          :class="{ active: selectedEventTypes.includes('ALL_EVENTS') }"
          @click="toggleEventType('ALL_EVENTS')"
        >
          <span class="checkbox" :class="{ checked: selectedEventTypes.includes('ALL_EVENTS') }" />
          <span class="option-label">All Events</span>
          <span v-if="facets" class="option-count">{{ facets.musicCount + facets.nonMusicCount }}</span>
        </button>
        <button
          v-if="showAllMusic"
          class="checkbox-option"
          :class="{ active: selectedEventTypes.includes('ALL_MUSIC') }"
          @click="toggleEventType('ALL_MUSIC')"
        >
          <span class="checkbox" :class="{ checked: selectedEventTypes.includes('ALL_MUSIC') }" />
          <span class="option-label">All Music</span>
          <span v-if="facets?.musicCount" class="option-count">{{ facets.musicCount }}</span>
        </button>
        <div v-if="musicEventTypes.length" class="sub-options">
          <TransitionGroup name="filter-list" tag="div">
            <button
              v-for="type in musicEventTypes"
              :key="type.value"
              class="checkbox-option small"
              :class="{ active: selectedEventTypes.includes(type.value) }"
              @click="toggleEventType(type.value)"
            >
              <span class="checkbox small" :class="{ checked: selectedEventTypes.includes(type.value) }" />
              <span class="option-label">{{ type.label }}</span>
              <span v-if="getTypeCount(type.value)" class="option-count">{{ getTypeCount(type.value) }}</span>
            </button>
          </TransitionGroup>
        </div>
        <div v-if="nonMusicEventTypes.length" class="pt-1">
          <TransitionGroup name="filter-list" tag="div">
            <button
              v-for="type in nonMusicEventTypes"
              :key="type.value"
              class="checkbox-option"
              :class="{ active: selectedEventTypes.includes(type.value) }"
              @click="toggleEventType(type.value)"
            >
              <span class="checkbox" :class="{ checked: selectedEventTypes.includes(type.value) }" />
              <span class="option-label">{{ type.label }}</span>
              <span v-if="getTypeCount(type.value)" class="option-count">{{ getTypeCount(type.value) }}</span>
            </button>
          </TransitionGroup>
        </div>
      </div>
    </div>

    <!-- Genre - only show when music type is selected and genres available -->
    <div v-if="availableGenres.length && hasMusicTypeSelected" class="filter-section">
      <button
        class="section-header"
        @click="toggleSection('genre')"
      >
        <span class="section-title">
          <UIcon name="i-heroicons-musical-note" class="w-4 h-4" />
          Genre
        </span>
        <span class="section-meta">
          <span v-if="!isSectionExpanded('genre') && genreSummary" class="section-summary">{{ genreSummary }}</span>
          <span v-else-if="!isSectionExpanded('genre')" class="section-summary muted">All genres</span>
          <UIcon
            :name="isSectionExpanded('genre') ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            class="w-4 h-4 text-gray-400"
          />
        </span>
      </button>
      <div v-if="isSectionExpanded('genre')" class="section-content">
        <TransitionGroup name="filter-list" tag="div">
          <button
            v-for="genre in visibleGenres"
            :key="genre"
            class="checkbox-option"
            :class="{ active: selectedGenres.includes(genre) }"
            @click="toggleGenre(genre)"
          >
            <span class="checkbox" :class="{ checked: selectedGenres.includes(genre) }" />
            <span class="option-label">
              {{ genreLabels?.[genre] || genre.charAt(0).toUpperCase() + genre.slice(1) }}
            </span>
            <span v-if="facets?.genreCounts?.[genre]" class="option-count">
              {{ facets.genreCounts[genre] }}
            </span>
          </button>
        </TransitionGroup>
        <button
          v-if="hasMoreGenres"
          class="show-more-btn"
          @click="showAllGenres = !showAllGenres"
        >
          {{ showAllGenres ? 'Show less' : `+ ${availableGenres.length - INITIAL_GENRE_COUNT} more` }}
        </button>
      </div>
    </div>

    <!-- Map Filter - opens in modal -->
    <div v-if="venuesWithCoords.length" class="map-section">
      <button
        class="map-trigger-btn"
        @click="showMapModal = true"
      >
        <UIcon name="i-heroicons-map" class="w-4 h-4" />
        <span>Filter by Location</span>
        <span v-if="mapFilteredVenueIds !== null" class="count-badge">{{ mapFilteredVenueIds.length }}</span>
      </button>
      <div v-if="mapFilteredVenueIds !== null" class="map-active-indicator">
        <span class="text-xs text-gray-600">
          {{ mapFilteredVenueIds.length }} venues in selected area
        </span>
        <button class="reset-map-btn" @click="resetMap">
          Clear
        </button>
      </div>
    </div>

    <!-- Map Modal -->
    <Teleport to="body">
      <div v-if="showMapModal" class="map-modal-overlay" @click.self="showMapModal = false">
        <div class="map-modal">
          <div class="map-modal-header">
            <h3 class="text-lg font-semibold">Filter by Location</h3>
            <button class="map-modal-close" @click="showMapModal = false">
              <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
            </button>
          </div>
          <div class="map-modal-body">
            <ClientOnly>
              <VenueMap
                :venues="venuesWithCoords"
                :persist-key="MAP_BOUNDS_KEY"
                :show-controls="true"
                class="h-full"
                @visible-venues="onMapVisibleVenues"
                @center-changed="onMapCenterChanged"
              />
            </ClientOnly>
          </div>
          <div class="map-modal-footer">
            <div class="map-footer-info">
              <span class="text-sm font-medium text-gray-900">
                {{ mapFilteredVenueIds?.length || venuesWithCoords.length }} venues
              </span>
              <span class="text-xs text-gray-500">
                Filters update as you pan/zoom
              </span>
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="mapFilteredVenueIds !== null"
                variant="ghost"
                size="sm"
                @click="resetMap"
              >
                Show All
              </UButton>
              <UButton
                color="primary"
                size="sm"
                @click="showMapModal = false"
              >
                Done
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Reset Button -->
    <div v-if="hasActiveFilters" class="reset-section">
      <button class="reset-all-btn" @click="resetFilters">
        <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
        Reset All Filters
        <span class="count-badge">{{ activeFilterCount }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar-filters {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.search-section {
  position: sticky;
  top: 0;
  background: white;
  padding-bottom: 0.5rem;
  margin: -1rem -1rem 0.5rem -1rem;
  padding: 1rem 1rem 0.75rem 1rem;
  border-bottom: 1px solid #e5e7eb;
  z-index: 10;
}

.filter-section {
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.5rem;
}

.filter-section:last-child {
  border-bottom: none;
}

.map-section {
  padding: 0.5rem 0;
}

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.section-header:hover {
  color: #2563eb;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.section-header:hover .section-title {
  color: #2563eb;
}

.section-meta {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  flex: 1;
  justify-content: flex-end;
}

.section-summary {
  font-size: 0.75rem;
  font-weight: 500;
  color: #2563eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.section-summary.muted {
  color: #9ca3af;
  font-weight: 400;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  background-color: #2563eb;
  border-radius: 9999px;
}

.section-content {
  padding: 0.25rem 0 0.5rem;
}

.radio-option,
.checkbox-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.8125rem;
  color: #374151;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
}

.radio-option:hover,
.checkbox-option:hover {
  background-color: #f3f4f6;
}

.radio-option.active,
.checkbox-option.active {
  background-color: #eff6ff;
  color: #1d4ed8;
}

.radio-dot {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  border: 2px solid #d1d5db;
  flex-shrink: 0;
}

.radio-dot.checked {
  border-color: #2563eb;
  background-color: #2563eb;
  box-shadow: inset 0 0 0 2px white;
}

.checkbox {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 0.1875rem;
  border: 2px solid #d1d5db;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox.small {
  width: 0.75rem;
  height: 0.75rem;
}

.checkbox.checked {
  border-color: #2563eb;
  background-color: #2563eb;
}

.checkbox.checked::after {
  content: '';
  width: 0.375rem;
  height: 0.25rem;
  border-left: 1.5px solid white;
  border-bottom: 1.5px solid white;
  transform: rotate(-45deg);
  margin-top: -1px;
}

.checkbox.small.checked::after {
  width: 0.3rem;
  height: 0.2rem;
}

.checkbox-option.small {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}

.sub-options {
  padding-left: 1rem;
  margin-left: 0.375rem;
  border-left: 2px solid #e5e7eb;
}

.calendar-wrapper {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #f9fafb;
  border-radius: 0.375rem;
}

.option-label {
  flex: 1;
  text-align: left;
}

.option-count {
  font-size: 0.6875rem;
  color: #9ca3af;
  margin-left: auto;
}

.checkbox-option.active .option-count {
  color: #60a5fa;
}

.show-more-btn {
  width: 100%;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #2563eb;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.show-more-btn:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.map-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #e5e7eb;
}

.reset-map-btn {
  font-size: 0.75rem;
  color: #6b7280;
  background: none;
  border: none;
  cursor: pointer;
}

.reset-map-btn:hover {
  color: #2563eb;
  text-decoration: underline;
}

.reset-section {
  padding-top: 0.75rem;
  margin-top: 0.25rem;
  border-top: 1px solid #e5e7eb;
}

.reset-all-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #6b7280;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.reset-all-btn:hover {
  background: #e5e7eb;
  color: #374151;
}

.reset-all-btn .count-badge {
  background-color: #6b7280;
}

/* Map trigger button */
.map-trigger-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.map-trigger-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.map-active-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: #eff6ff;
  border-radius: 0.25rem;
}

/* Map Modal */
.map-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}

.map-modal {
  background: white;
  border-radius: 0.75rem;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.map-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
}

.map-modal-close {
  padding: 0.25rem;
  color: #6b7280;
  border-radius: 0.375rem;
  transition: all 0.15s;
}

.map-modal-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.map-modal-body {
  flex: 1;
  min-height: 400px;
  height: 50vh;
  max-height: 60vh;
}

.map-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 0 0 0.75rem 0.75rem;
}

.map-footer-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

/* Filter list transitions - use :deep for Vue transitions */
:deep(.filter-list-enter-active),
:deep(.filter-list-leave-active) {
  transition: all 0.2s ease;
}

:deep(.filter-list-enter-from) {
  opacity: 0;
  transform: translateX(-10px);
}

:deep(.filter-list-leave-to) {
  opacity: 0;
  transform: translateX(10px);
}

:deep(.filter-list-move) {
  transition: transform 0.2s ease;
}

/* Smooth count updates */
.option-count {
  transition: all 0.2s ease;
}

/* Checkbox animation */
.checkbox {
  transition: all 0.15s ease;
}

.checkbox.checked {
  transform: scale(1.05);
}

/* Section expand/collapse */
.section-content {
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Active state pulse */
.checkbox-option.active,
.radio-option.active {
  transition: background-color 0.15s ease;
}

/* Map modal animation */
.map-modal-overlay {
  animation: fadeIn 0.2s ease;
}

.map-modal {
  animation: scaleIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Venue search/autocomplete */
.venue-search-wrapper {
  position: relative;
  margin-bottom: 0.5rem;
}

.venue-search-input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.venue-search-icon {
  position: absolute;
  left: 0.5rem;
  width: 1rem;
  height: 1rem;
  color: #9ca3af;
  pointer-events: none;
}

.venue-search-input {
  width: 100%;
  padding: 0.375rem 0.5rem 0.375rem 1.75rem;
  font-size: 0.8125rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  background: white;
  outline: none;
  transition: all 0.15s;
}

.venue-search-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.venue-search-input::placeholder {
  color: #9ca3af;
}

.venue-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  z-index: 20;
  max-height: 200px;
  overflow-y: auto;
}

.venue-dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.venue-dropdown-item:hover {
  background: #f3f4f6;
}

.venue-dropdown-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.venue-dropdown-empty {
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  color: #9ca3af;
  text-align: center;
}

/* Venue chips */
.venue-chips {
  margin-bottom: 0.5rem;
}

.venue-chips-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.venue-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.375rem 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 9999px;
  border: 1px solid #bfdbfe;
}

.venue-chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.125rem;
  color: #60a5fa;
  background: none;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.15s;
}

.venue-chip-remove:hover {
  color: #1d4ed8;
  background: #dbeafe;
}

/* Browse all venues button */
.browse-venues-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.browse-venues-btn:hover {
  color: #2563eb;
  border-color: #2563eb;
  background: #f8fafc;
}

.venue-browse-list {
  margin-top: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  padding: 0.25rem;
}
</style>
