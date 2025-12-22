<script setup lang="ts">
import type { ScraperListItem, ListScrapersResponse } from '~/types/scraper'

definePageMeta({
  middleware: 'admin',
})

interface AgentThinkingStep {
  type: string
  message: string
  timestamp: Date
  data?: any
}

interface VenueInfo {
  name?: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  website?: string
  phone?: string
  description?: string
  venueType?: string
  capacity?: number
  imageUrl?: string
}

interface ScraperData {
  id: string
  name: string
  website: string | null
  lastRunAt: string | null
  lastRunStatus: string | null
  isActive: boolean
  generatedCode?: string | null
  llmProvider?: string | null
  llmModel?: string | null
}

// State
const url = ref('')
const selectedProvider = ref('anthropic')
const selectedModel = ref('claude-sonnet-4-20250514') // Use Claude Sonnet 4 as default
const maxIterations = ref(2)

// Mode: 'new' for new venues, 'update' for existing venue scraper update
const mode = ref<'new' | 'update'>('new')
const selectedExistingVenue = ref<any>(null)
const existingScraperData = ref<ScraperData | null>(null) // Existing scraper code for update mode
const loadingScraperData = ref(false)

// For 'new' mode - start with manual form, optionally scrape
const showManualForm = ref(true) // Default to showing manual form
const manualVenueData = ref<VenueInfo>({
  name: '',
  website: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  phone: '',
  description: '',
  venueType: undefined,
  capacity: undefined,
  imageUrl: '',
})

// Computed: Check if required fields are valid
const isVenueFormValid = computed(() => {
  const data = sessionType.value === 'VENUE_INFO' && venueData.value ? venueData.value : manualVenueData.value
  return !!(data.name?.trim() && data.website?.trim())
})

// Agent session state
const sessionId = ref<string | null>(null)
const sessionType = ref<'VENUE_INFO' | 'EVENT_SCRAPER'>('VENUE_INFO')
const status = ref<'idle' | 'running' | 'executing' | 'success' | 'failed'>('idle')
const thinking = ref<AgentThinkingStep[]>([])
const venueData = ref<VenueInfo | null>(null)
const eventData = ref<any[] | null>(null)
const completenessScore = ref(0)
const errorMessage = ref('')

// Second stage state (after venue info scraped)
const showEventScraper = ref(false)
const existingVenueId = ref<string | null>(null) // Set when using existing venue

// Saved state (after scraper approved)
const savedVenueId = ref<string | null>(null)
const savedEventCount = ref(0)

// Existing scrapers list
const existingScrapers = ref<ScraperListItem[]>([])
const loadingScrapers = ref(false)

// Paused scrapers (notifications suspended due to duplicate detection)
const pausedScrapers = computed(() => existingScrapers.value.filter(s => s.notificationsPaused))

// Fetch existing scrapers
async function fetchScrapers() {
  loadingScrapers.value = true
  try {
    const data = await $fetch<ListScrapersResponse>('/api/scrapers/list')
    existingScrapers.value = data.scrapers.filter(s => s.hasCode)
  } catch (error) {
    console.error('Failed to fetch scrapers:', error)
  } finally {
    loadingScrapers.value = false
  }
}

// Unpause notifications for a scraper
async function unpauseNotifications(scraperId: string) {
  try {
    await $fetch(`/api/scrapers/${scraperId}/unpause-notifications`, {
      method: 'POST',
    })
    // Refresh the list
    await fetchScrapers()
  } catch (error) {
    console.error('Failed to unpause notifications:', error)
    alert('Failed to unpause notifications')
  }
}

// Load scrapers on mount
onMounted(() => {
  fetchScrapers()
})

// Reset to add another venue
function resetForNewVenue() {
  url.value = ''
  sessionId.value = null
  sessionType.value = 'VENUE_INFO'
  status.value = 'idle'
  thinking.value = []
  venueData.value = null
  eventData.value = null
  completenessScore.value = 0
  errorMessage.value = ''
  showEventScraper.value = false
  existingVenueId.value = null
  savedVenueId.value = null
  savedEventCount.value = 0
  showFeedbackInput.value = false
  feedbackText.value = ''
  lastSubmittedFeedback.value = ''
  selectedExistingVenue.value = null
  existingScraperData.value = null
  showManualForm.value = true
  manualVenueData.value = {
    name: '',
    website: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    phone: '',
    description: '',
    venueType: undefined,
    capacity: undefined,
    imageUrl: '',
  }
}

// Handle existing venue selection in update mode
async function onExistingVenueSelected() {
  if (!selectedExistingVenue.value) {
    // Reset if no venue selected
    existingVenueId.value = null
    venueData.value = null
    showEventScraper.value = false
    url.value = ''
    existingScraperData.value = null
    showFeedbackInput.value = false
    return
  }

  const venue = selectedExistingVenue.value
  existingVenueId.value = venue.id
  venueData.value = {
    name: venue.name,
    website: venue.website,
    address: venue.address,
    city: venue.city,
    state: venue.state,
    postalCode: venue.postalCode,
  }
  // Pre-fill URL with venue website if available
  if (venue.website && !url.value) {
    url.value = venue.website
  }
  // Skip to event scraper stage
  showEventScraper.value = true
  sessionType.value = 'EVENT_SCRAPER'

  // Fetch existing scraper data for this venue
  loadingScraperData.value = true
  try {
    const result = await $fetch<{ scraper: ScraperData | null; venue: any }>(`/api/venues/${venue.id}/scraper`)
    existingScraperData.value = result.scraper

    // If there's an existing scraper, show the feedback input by default
    if (result.scraper?.generatedCode) {
      showFeedbackInput.value = true
      // Pre-fill URL from scraper website if different
      if (result.scraper.website && result.scraper.website !== venue.website) {
        url.value = result.scraper.website
      }
    }
  } catch {
    existingScraperData.value = null
  } finally {
    loadingScraperData.value = false
  }
}

// Attempts review
const showAttemptsModal = ref(false)
const attemptsData = ref<any>(null)

// Feedback for retry
const showFeedbackInput = ref(false)
const feedbackText = ref('')
const lastSubmittedFeedback = ref('')

// Load attempts when modal opens
watch(showAttemptsModal, async (show) => {
  if (show && sessionId.value) {
    try {
      attemptsData.value = await $fetch(`/api/agent/attempts/${sessionId.value}`)
    } catch (error) {
      console.error('Failed to load attempts:', error)
    }
  }
})

// Available models
const { data: modelsData } = await useFetch('/api/agent/models')
const providers = computed(() => modelsData.value?.providers ?? [])

// Available venues for linking
const { data: venuesData } = await useFetch('/api/venues?limit=100')
const availableVenues = computed(() => venuesData.value?.venues ?? [])

// Check for venueId in query params and auto-select that venue
const route = useRoute()
onMounted(() => {
  const venueId = route.query.venueId as string
  if (venueId && availableVenues.value.length > 0) {
    const venue = availableVenues.value.find((v: any) => v.id === venueId)
    if (venue) {
      mode.value = 'update'
      selectedExistingVenue.value = venue
      onExistingVenueSelected()
    }
  }
})

// Also watch for when venues load after mount
watch(availableVenues, (venues) => {
  const venueId = route.query.venueId as string
  if (venueId && venues.length > 0 && !selectedExistingVenue.value) {
    const venue = venues.find((v: any) => v.id === venueId)
    if (venue) {
      mode.value = 'update'
      selectedExistingVenue.value = venue
      onExistingVenueSelected()
    }
  }
}, { once: true })

// Set default provider/model from API
watch(modelsData, (data) => {
  if (data?.defaultProvider) {
    selectedProvider.value = data.defaultProvider
  }
  if (data?.defaultModel) {
    selectedModel.value = data.defaultModel
  }
}, { immediate: true })

// Get models for selected provider
const availableModels = computed(() => {
  const provider = providers.value.find((p: any) => p.provider === selectedProvider.value)
  return provider?.models ?? []
})

// Auto-select first model when provider changes
watch(selectedProvider, (newProvider) => {
  const provider = providers.value.find((p: any) => p.provider === newProvider)
  const firstModel = provider?.models?.[0]
  if (firstModel) {
    selectedModel.value = firstModel.id
  }
})

// Friendly status labels based on current step type
const currentStatusLabel = computed(() => {
  if (thinking.value.length === 0) return 'Starting...'

  const lastStep = thinking.value[thinking.value.length - 1]
  const stepLabels: Record<string, string> = {
    analysis: 'Analyzing page...',
    planning: 'Planning approach...',
    code_generation: 'Writing scraper code...',
    execution: 'Running scraper...',
    evaluation: 'Checking results...',
    improvement: 'Improving scraper...',
    success: 'Success!',
    failure: 'Failed',
  }
  return (lastStep?.type && stepLabels[lastStep.type]) || 'Processing...'
})

// Current attempt number based on planning steps
const currentAttempt = computed(() => {
  const planningSteps = thinking.value.filter(t => t.type === 'planning').length
  return Math.max(1, planningSteps)
})

// Retry with user feedback
async function retryWithFeedback() {
  if (!feedbackText.value.trim()) {
    alert('Please enter feedback to help improve the scraper')
    return
  }

  showFeedbackInput.value = false

  // Start a new session with the feedback
  status.value = 'running'
  thinking.value = []
  errorMessage.value = ''

  try {
    const response = await $fetch('/api/agent/start', {
      method: 'POST',
      body: {
        url: url.value,
        sessionType: sessionType.value,
        llmProvider: selectedProvider.value,
        llmModel: selectedModel.value,
        maxIterations: maxIterations.value,
        venueInfo: venueData.value,
        existingVenueId: existingVenueId.value,
        userFeedback: feedbackText.value, // Pass the feedback
      },
    })

    sessionId.value = response.sessionId
    lastSubmittedFeedback.value = feedbackText.value // Save for potential reuse
    feedbackText.value = '' // Clear for next time

    // Connect to SSE stream
    const eventSource = new EventSource(`/api/agent/stream/${response.sessionId}`)
    currentEventSource.value = eventSource

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'complete') {
        eventSource.close()
        currentEventSource.value = null

        if (data.status === 'SUCCESS') {
          status.value = 'success'
          if (sessionType.value === 'VENUE_INFO') {
            venueData.value = data.venueData || null
          } else {
            eventData.value = data.eventData || null
          }
          completenessScore.value = data.completenessScore || 0
        } else {
          status.value = 'failed'
          errorMessage.value = data.errorMessage || 'Failed to generate scraper'
        }
      } else if (data.type === 'data_update') {
        if (sessionType.value === 'VENUE_INFO' && data.venueData) {
          venueData.value = data.venueData
        } else if (data.eventData) {
          eventData.value = data.eventData
        }
        if (data.completenessScore !== undefined) {
          completenessScore.value = data.completenessScore
        }
      } else if (data.type === 'error') {
        eventSource.close()
        currentEventSource.value = null
        status.value = 'failed'
        errorMessage.value = data.message || 'An error occurred'
      } else {
        thinking.value.push(data)
      }
    }

    eventSource.onerror = async () => {
      eventSource.close()
      currentEventSource.value = null

      // Check if session actually completed (connection might have dropped after success)
      if (sessionId.value) {
        try {
          const session = await $fetch(`/api/agent/session/${sessionId.value}`)
          if (session.status === 'SUCCESS') {
            status.value = 'success'
            if (sessionType.value === 'VENUE_INFO') {
              venueData.value = session.venueData || null
            } else {
              eventData.value = session.eventData || null
            }
            completenessScore.value = session.completenessScore || 0
            return
          } else if (session.status === 'FAILED') {
            status.value = 'failed'
            errorMessage.value = session.errorMessage || 'Scraper generation failed'
            return
          } else if (session.status === 'IN_PROGRESS') {
            errorMessage.value = 'Connection lost but scraper is still running. Refresh to check status.'
          }
        } catch {
          // Couldn't check session
        }
      }

      status.value = 'failed'
      if (!errorMessage.value) {
        errorMessage.value = 'Real-time connection failed. The scraper may still be running - try refreshing.'
      }
    }
  } catch (error: any) {
    status.value = 'failed'
    errorMessage.value = error.message || 'Failed to start retry'
  }
}

// Clean text for preview - strip HTML and decode entities
function cleanText(text: string | undefined | null): string | undefined {
  if (!text) return undefined
  return stripHtmlAndClean(text)
}

// Adapt scraped event data to match EventCard's expected format
function adaptScrapedEvent(event: any, index: number) {
  return {
    id: `preview-${index}`,
    title: cleanText(event.title) || 'Untitled',
    slug: `preview-${index}`,
    description: cleanText(event.description),
    imageUrl: event.imageUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    doorsAt: event.doorsAt,
    coverCharge: event.coverCharge,
    ageRestriction: event.ageRestriction || 'ALL_AGES',
    ticketUrl: event.ticketUrl,
    sourceUrl: event.sourceUrl,
    genres: event.genres || [],
    eventArtists: (event.artists || []).map((a: any, i: number) => ({
      artist: {
        id: `artist-${i}`,
        name: cleanText(typeof a === 'string' ? a : a.name) || 'Unknown Artist',
        slug: `artist-${i}`,
        genres: [],
      },
      order: i,
    })),
  }
}

// Start venue info scraper
async function startVenueInfoScraper() {
  if (!url.value) {
    alert('Please enter a venue URL')
    return
  }

  // Check if URL already exists in database
  try {
    const checkResult = await $fetch('/api/agent/check-url', {
      method: 'POST',
      body: { url: url.value },
    })

    const result = checkResult as any
    if (result.exists && result.type === 'venue') {
      if (result.hasScraper) {
        // Venue exists with scraper
        const confirmed = confirm(
          `This venue already exists with a scraper:\n\n` +
          `Venue: ${result.data.name}\n` +
          `Scraper: ${result.scraper?.name}\n` +
          (result.data.region ? `Region: ${result.data.region}\n` : '') +
          `\nDo you want to create a NEW scraper for this venue?`
        )
        if (!confirmed) {
          return
        }
      } else {
        // Venue exists without scraper - offer to create scraper
        const createScraper = confirm(
          `This venue already exists but has no scraper:\n\n` +
          `Venue: ${result.data.name}\n` +
          (result.data.region ? `Region: ${result.data.region}\n` : '') +
          `\nWould you like to create a scraper for this venue?\n\n` +
          `Click OK to create scraper, or Cancel to re-scrape venue info.`
        )
        if (createScraper) {
          // Skip to event scraper phase with existing venue data
          existingVenueId.value = result.data.id
          venueData.value = {
            name: result.data.name,
            website: result.data.website,
          }
          showEventScraper.value = true
          status.value = 'idle'
          return
        }
        // Otherwise continue with venue scraping
      }
    } else if (result.exists && result.type === 'source') {
      // Only scraper exists (no venue match)
      const confirmed = confirm(
        `A scraper already exists for this URL:\n\n` +
        `Scraper: ${result.data.name}\n` +
        `\nDo you want to create a new venue and scraper anyway?`
      )
      if (!confirmed) {
        return
      }
    }
  } catch (error) {
    console.error('Failed to check URL:', error)
    // Continue anyway if check fails
  }

  status.value = 'running'
  thinking.value = []
  venueData.value = null
  errorMessage.value = ''
  sessionType.value = 'VENUE_INFO'

  try {
    // Start the agent (returns immediately with session ID)
    const response = await $fetch('/api/agent/start', {
      method: 'POST',
      body: {
        url: url.value,
        sessionType: 'VENUE_INFO',
        llmProvider: selectedProvider.value,
        llmModel: selectedModel.value,
        maxIterations: maxIterations.value,
      },
    })

    sessionId.value = response.sessionId

    // Connect to SSE stream for real-time updates
    const eventSource = new EventSource(`/api/agent/stream/${response.sessionId}`)
    currentEventSource.value = eventSource

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'complete') {
        // Session complete - update with final data
        eventSource.close()
        currentEventSource.value = null

        if (data.status === 'SUCCESS') {
          status.value = 'success'
          venueData.value = data.venueData || null
          completenessScore.value = data.completenessScore || 0
          showEventScraper.value = true
        } else {
          status.value = 'failed'
          errorMessage.value = data.errorMessage || 'Failed to generate scraper'
        }
      } else if (data.type === 'data_update') {
        // Real-time data update - update preview
        if (data.venueData) {
          venueData.value = data.venueData
        }
        if (data.completenessScore !== undefined) {
          completenessScore.value = data.completenessScore
        }
      } else if (data.type === 'error') {
        // Error from SSE
        eventSource.close()
        currentEventSource.value = null
        status.value = 'failed'
        errorMessage.value = data.message || 'An error occurred'
      } else {
        // Add thinking step
        thinking.value.push(data)
      }
    }

    eventSource.onerror = async () => {
      eventSource.close()
      currentEventSource.value = null

      // Check if session actually completed (connection might have dropped after success)
      if (sessionId.value) {
        try {
          const session = await $fetch(`/api/agent/session/${sessionId.value}`)
          if (session.status === 'SUCCESS') {
            status.value = 'success'
            venueData.value = session.venueData || null
            completenessScore.value = session.completenessScore || 0
            showEventScraper.value = true
            return
          } else if (session.status === 'FAILED') {
            status.value = 'failed'
            errorMessage.value = session.errorMessage || 'Scraper generation failed'
            return
          } else if (session.status === 'IN_PROGRESS') {
            // Still running - connection dropped but agent is working
            errorMessage.value = 'Connection lost but scraper is still running. Refresh to check status.'
          }
        } catch {
          // Couldn't check session
        }
      }

      status.value = 'failed'
      if (!errorMessage.value) {
        errorMessage.value = 'Real-time connection failed. The scraper may still be running - try refreshing.'
      }
    }
  } catch (error: any) {
    status.value = 'failed'
    errorMessage.value = error.message || 'An error occurred'
  }
}


// Start event scraper (second stage)
async function startEventScraper() {
  if (!venueData.value || !url.value) {
    alert('Venue information must be scraped first')
    return
  }

  status.value = 'running'
  thinking.value = []
  eventData.value = null
  errorMessage.value = ''
  sessionType.value = 'EVENT_SCRAPER'

  try {
    // Start the agent (returns immediately with session ID)
    const response = await $fetch('/api/agent/start', {
      method: 'POST',
      body: {
        url: url.value,
        sessionType: 'EVENT_SCRAPER',
        llmProvider: selectedProvider.value,
        llmModel: selectedModel.value,
        maxIterations: maxIterations.value,
        venueInfo: venueData.value,
        existingVenueId: existingVenueId.value, // Pass existing venue ID if set
        // Pass previous scraper code and feedback for updates
        previousCode: existingScraperData.value?.generatedCode || null,
        userFeedback: feedbackText.value.trim() || null,
      },
    })

    sessionId.value = response.sessionId
    if (feedbackText.value.trim()) {
      lastSubmittedFeedback.value = feedbackText.value // Save for potential reuse
    }
    feedbackText.value = '' // Clear feedback after starting

    // Connect to SSE stream for real-time updates
    const eventSource = new EventSource(`/api/agent/stream/${response.sessionId}`)
    currentEventSource.value = eventSource

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'complete') {
        // Session complete - update with final data
        eventSource.close()
        currentEventSource.value = null

        if (data.status === 'SUCCESS') {
          status.value = 'success'
          eventData.value = data.eventData || null
          completenessScore.value = data.completenessScore || 0
        } else {
          status.value = 'failed'
          errorMessage.value = data.errorMessage || 'Failed to generate scraper'
        }
      } else if (data.type === 'data_update') {
        // Real-time data update - update preview
        if (data.eventData) {
          eventData.value = data.eventData
        }
        if (data.completenessScore !== undefined) {
          completenessScore.value = data.completenessScore
        }
      } else if (data.type === 'error') {
        // Error from SSE
        eventSource.close()
        currentEventSource.value = null
        status.value = 'failed'
        errorMessage.value = data.message || 'An error occurred'
      } else {
        // Add thinking step
        thinking.value.push(data)
      }
    }

    eventSource.onerror = async () => {
      eventSource.close()
      currentEventSource.value = null

      // Check if session actually completed (connection might have dropped after success)
      if (sessionId.value) {
        try {
          const session = await $fetch(`/api/agent/session/${sessionId.value}`)
          if (session.status === 'SUCCESS') {
            status.value = 'success'
            eventData.value = session.eventData || null
            completenessScore.value = session.completenessScore || 0
            return
          } else if (session.status === 'FAILED') {
            status.value = 'failed'
            errorMessage.value = session.errorMessage || 'Scraper generation failed'
            return
          } else if (session.status === 'IN_PROGRESS') {
            errorMessage.value = 'Connection lost but scraper is still running. Refresh to check status.'
          }
        } catch {
          // Couldn't check session
        }
      }

      status.value = 'failed'
      if (!errorMessage.value) {
        errorMessage.value = 'Real-time connection failed. The scraper may still be running - try refreshing.'
      }
    }
  } catch (error: any) {
    status.value = 'failed'
    errorMessage.value = error.message || 'An error occurred'
  }
}

// Cancel current scraping session
const currentEventSource = ref<EventSource | null>(null)

async function cancelScraping() {
  // Close SSE connection
  if (currentEventSource.value) {
    currentEventSource.value.close()
    currentEventSource.value = null
  }

  // Update session status in database if we have a session
  if (sessionId.value) {
    try {
      await $fetch(`/api/agent/cancel/${sessionId.value}`, {
        method: 'POST',
      })
    } catch (error) {
      console.error('Failed to cancel session:', error)
    }
  }

  // Reset UI state
  status.value = 'idle'
  thinking.value = []
  errorMessage.value = 'Cancelled by user'
}

// Approve and create records
async function approveVenue() {
  if (!sessionId.value) {
    alert('No session to approve')
    return
  }

  try {
    const response = await $fetch('/api/agent/approve', {
      method: 'POST',
      body: {
        sessionId: sessionId.value,
      },
    }) as any

    // Show success message
    alert(`Venue "${response.venue?.name}" created successfully! Now let's set up the event scraper.`)

    // Set up for event scraper phase - keep venue data, set venue ID
    existingVenueId.value = response.venue?.id
    // Keep venueData for the event scraper (it needs name/website)
    venueData.value = {
      name: response.venue?.name,
      website: response.venue?.website || url.value,
    }
    thinking.value = []
    eventData.value = null
    completenessScore.value = 0
    status.value = 'idle'
    showEventScraper.value = true
    sessionId.value = null // Clear old session so we create a new one for events

  } catch (error: any) {
    alert(`Failed to approve: ${error.message}`)
  }
}

// Create venue from manual form (without AI scraping)
async function createVenueFromForm() {
  if (!isVenueFormValid.value) {
    alert('Please fill in the required fields (Name and Website)')
    return
  }

  try {
    // Create venue directly via API
    const response = await $fetch('/api/agent/create-venue', {
      method: 'POST',
      body: {
        venueData: manualVenueData.value,
      },
    }) as any

    // Set up for event scraper phase
    existingVenueId.value = response.venue?.id
    venueData.value = {
      name: response.venue?.name,
      website: response.venue?.website || manualVenueData.value.website,
    }
    url.value = manualVenueData.value.website || ''
    showEventScraper.value = true
    showManualForm.value = false
    status.value = 'idle'

    alert(`Venue "${response.venue?.name}" created successfully! Now set up the event scraper.`)
  } catch (error: any) {
    alert(`Failed to create venue: ${error.message}`)
  }
}

// Approve event scraper and create source
async function approveScraper() {
  if (!sessionId.value) {
    alert('No session to approve')
    return
  }

  // Need to link to a venue first (button should be disabled, but double-check)
  if (!existingVenueId.value) {
    return
  }

  try {
    const response = await $fetch('/api/agent/approve', {
      method: 'POST',
      body: {
        sessionId: sessionId.value,
        venueId: existingVenueId.value,
      },
    })

    if (response.source?.id) {
      // Run the scraper immediately
      status.value = 'executing'
      thinking.value = [{ type: 'execution', message: 'Running scraper to fetch live events...', timestamp: new Date() }]

      try {
        const runResult = await $fetch('/api/agent/run-scraper', {
          method: 'POST',
          body: { sourceId: response.source.id },
          timeout: 200000, // 200 seconds - scraper may need to visit many pages
        }) as any

        if (runResult.success) {
          eventData.value = runResult.events || []
          savedVenueId.value = existingVenueId.value
          savedEventCount.value = runResult.eventCount || 0
          status.value = 'success'
        } else {
          status.value = 'failed'
          errorMessage.value = runResult.error || 'Scraper execution failed'
        }
      } catch (runError: any) {
        status.value = 'failed'
        errorMessage.value = runError.message
      }
    } else {
      status.value = 'success'
    }

  } catch (error: any) {
    alert(`Failed to approve: ${error.message}`)
  }
}

useSeoMeta({
  title: 'Venue Scraper Manager - AI Scraper Generator',
  description: 'Use AI to automatically generate or update scrapers for venues',
})
</script>

<template>
  <div class="px-4 py-8 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">
      Venue Scraper Manager
    </h1>

    <!-- Paused Scrapers Alert -->
    <div
      v-if="pausedScrapers.length > 0"
      class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6"
    >
      <div class="flex items-start gap-3 mb-4">
        <UIcon
          name="i-heroicons-exclamation-triangle"
          class="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5"
        />
        <div>
          <h2 class="text-xl font-semibold text-red-900">
            Notifications Paused
          </h2>
          <p class="text-sm text-red-700 mt-1">
            These scrapers have notifications paused due to detected duplicate events.
            Review and fix the scraper before unpausing.
          </p>
        </div>
      </div>
      <div class="space-y-3">
        <div
          v-for="scraper in pausedScrapers"
          :key="scraper.id"
          class="bg-white border border-red-200 rounded-lg p-4"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-gray-900">
                {{ scraper.name }}
              </h3>
              <p class="text-sm text-gray-600 truncate">
                {{ scraper.website }}
              </p>
              <p class="text-sm text-red-600 mt-1">
                {{ scraper.notificationsPausedReason }}
              </p>
              <p
                v-if="scraper.notificationsPausedAt"
                class="text-xs text-gray-500 mt-1"
              >
                Paused: {{ new Date(scraper.notificationsPausedAt).toLocaleString() }}
              </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <NuxtLink :to="`/admin/scrapers/${scraper.id}/manage`">
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                >
                  Review
                </UButton>
              </NuxtLink>
              <UButton
                size="sm"
                color="success"
                @click="unpauseNotifications(scraper.id)"
              >
                Unpause
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Existing Scrapers List -->
    <div
      v-if="existingScrapers.length > 0"
      class="bg-white rounded-lg shadow p-6 mb-6"
    >
      <h2 class="text-xl font-semibold mb-4">
        Existing Scrapers
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="scraper in existingScrapers"
          :key="scraper.id"
          class="border rounded-lg p-4"
        >
          <div class="flex items-start justify-between mb-2">
            <h3 class="font-medium">
              {{ scraper.name }}
            </h3>
            <UBadge
              v-if="scraper.activeVersion && scraper.activeVersion > 1"
              size="xs"
              color="primary"
            >
              v{{ scraper.activeVersion }}
            </UBadge>
          </div>
          <p class="text-sm text-gray-600 mb-3">
            {{ scraper.website }}
          </p>
          <NuxtLink
            :to="`/admin/scrapers/${scraper.id}/manage`"
            class="inline-block"
          >
            <UButton
              size="sm"
              variant="soft"
            >
              Manage
            </UButton>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Mode Toggle -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="flex gap-4 mb-4">
        <button
          :class="mode === 'new'
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
          class="px-4 py-2 rounded-lg font-medium transition-colors"
          :disabled="status === 'running'"
          @click="mode = 'new'; resetForNewVenue()"
        >
          Add New Venue
        </button>
        <button
          :class="mode === 'update'
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
          class="px-4 py-2 rounded-lg font-medium transition-colors"
          :disabled="status === 'running'"
          @click="mode = 'update'; resetForNewVenue()"
        >
          Update Existing Scraper
        </button>
      </div>

      <!-- Update Mode: Select Existing Venue -->
      <div
        v-if="mode === 'update'"
        class="mb-4 p-4 bg-blue-50 rounded-lg"
      >
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Select Venue to Update
        </label>
        <select
          v-model="selectedExistingVenue"
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          :disabled="status === 'running'"
          @change="onExistingVenueSelected"
        >
          <option :value="null">
            -- Select a venue --
          </option>
          <option
            v-for="venue in availableVenues"
            :key="venue.id"
            :value="venue"
          >
            {{ venue.name }} ({{ venue.city }})
          </option>
        </select>

        <!-- Loading indicator -->
        <div
          v-if="loadingScraperData"
          class="mt-3 text-sm text-gray-500 flex items-center gap-2"
        >
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
          Loading existing scraper...
        </div>

        <!-- Existing scraper info -->
        <div
          v-else-if="existingScraperData"
          class="mt-3 p-3 bg-white rounded border border-blue-200"
        >
          <div class="flex items-center gap-2 text-sm">
            <span class="font-medium text-green-700">Existing scraper found</span>
            <span
              v-if="existingScraperData.lastRunAt"
              class="text-gray-500"
            >
              · Last run: {{ new Date(existingScraperData.lastRunAt).toLocaleDateString() }}
            </span>
            <span
              v-if="existingScraperData.lastRunStatus"
              class="px-1.5 py-0.5 text-xs rounded"
              :class="existingScraperData.lastRunStatus === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
            >
              {{ existingScraperData.lastRunStatus }}
            </span>
          </div>
          <p class="text-xs text-gray-500 mt-1">
            The existing code will be provided to the AI as a starting point.
          </p>
        </div>

        <!-- No scraper found -->
        <div
          v-else-if="selectedExistingVenue && !loadingScraperData"
          class="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200"
        >
          <p class="text-sm text-yellow-700">
            No existing scraper found for this venue. A new one will be created.
          </p>
        </div>
      </div>

      <!-- Feedback input (shown by default in update mode when scraper exists) -->
      <div
        v-if="mode === 'update' && existingScraperData && status === 'idle'"
        class="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200"
      >
        <label class="block text-sm font-medium text-amber-900 mb-2">
          What should the scraper do differently? (optional)
        </label>
        <textarea
          v-model="feedbackText"
          placeholder="e.g., The scraper is missing event descriptions. Click the 'More Info' button on each event to get the full details."
          rows="3"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <p class="text-xs text-gray-500 mt-1">
          Leave blank to regenerate with the same approach, or provide feedback to guide improvements.
        </p>
      </div>

      <!-- New Venue Mode: Manual Form -->
      <div
        v-if="mode === 'new' && showManualForm && !showEventScraper"
        class="mb-6 p-4 bg-gray-50 rounded-lg border"
      >
        <h3 class="font-semibold text-gray-900 mb-4">
          Venue Information
        </h3>

        <div class="space-y-4">
          <!-- Required Fields -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Name <span class="text-red-500">*</span>
              </label>
              <input
                v-model="manualVenueData.name"
                type="text"
                placeholder="Venue name"
                class="w-full px-3 py-2 border rounded-lg"
                :class="manualVenueData.name ? 'border-gray-300' : 'border-red-300'"
              >
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Website <span class="text-red-500">*</span>
              </label>
              <input
                v-model="manualVenueData.website"
                type="url"
                placeholder="https://..."
                class="w-full px-3 py-2 border rounded-lg"
                :class="manualVenueData.website ? 'border-gray-300' : 'border-red-300'"
              >
            </div>
          </div>

          <!-- Address -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              v-model="manualVenueData.address"
              type="text"
              placeholder="Street address"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                v-model="manualVenueData.city"
                type="text"
                placeholder="City"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                v-model="manualVenueData.state"
                type="text"
                placeholder="State"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Zip</label>
              <input
                v-model="manualVenueData.postalCode"
                type="text"
                placeholder="Zip"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                v-model="manualVenueData.phone"
                type="tel"
                placeholder="Phone"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Venue Type</label>
              <select
                v-model="manualVenueData.venueType"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option :value="undefined">
                  Select type...
                </option>
                <option value="BAR">
                  Bar
                </option>
                <option value="BREWERY">
                  Brewery
                </option>
                <option value="CLUB">
                  Club
                </option>
                <option value="THEATER">
                  Theater
                </option>
                <option value="CONCERT_HALL">
                  Concert Hall
                </option>
                <option value="OUTDOOR">
                  Outdoor
                </option>
                <option value="CAFE">
                  Cafe
                </option>
                <option value="RESTAURANT">
                  Restaurant
                </option>
                <option value="OTHER">
                  Other
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
              <input
                v-model.number="manualVenueData.capacity"
                type="number"
                placeholder="Capacity"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              v-model="manualVenueData.description"
              placeholder="Description"
              rows="2"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            :disabled="!isVenueFormValid"
            class="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            @click="createVenueFromForm"
          >
            Create Venue & Continue to Scraper
          </button>
          <div class="text-center text-gray-500 text-sm py-2">
            or
          </div>
          <button
            class="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 border border-gray-300"
            @click="showManualForm = false"
          >
            Auto-fill from URL
          </button>
        </div>
      </div>

      <!-- URL Scraping Mode (for new venues when not showing manual form, or for update mode) -->
      <div v-if="(mode === 'new' && !showManualForm && !showEventScraper) || (mode === 'update' && showEventScraper)">
        <!-- URL Input -->
        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <label class="block text-sm font-medium text-gray-700">
              Venue URL to scrape
            </label>
            <button
              v-if="mode === 'new'"
              class="text-sm text-primary-600 hover:underline"
              @click="showManualForm = true"
            >
              Back to manual form
            </button>
          </div>
          <input
            v-model="url"
            type="url"
            placeholder="https://example.com/events"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            :disabled="status === 'running'"
          >
        </div>

        <!-- Provider Selection -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              AI Provider
            </label>
            <select
              v-model="selectedProvider"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              :disabled="status === 'running'"
            >
              <option
                v-for="provider in providers"
                :key="provider.provider"
                :value="provider.provider"
              >
                {{ provider.provider }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Model
            </label>
            <select
              v-model="selectedModel"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              :disabled="status === 'running'"
            >
              <option
                v-for="model in availableModels"
                :key="model.id"
                :value="model.id"
              >
                {{ model.name }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Max Iterations
            </label>
            <input
              v-model.number="maxIterations"
              type="number"
              min="1"
              max="10"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              :disabled="status === 'running'"
            >
          </div>
        </div>

        <!-- Start Button for URL scraping -->
        <div class="flex gap-3">
          <!-- New venue mode (URL scraping): start with venue info scraper -->
          <button
            v-if="mode === 'new' && !showEventScraper && status !== 'running'"
            :disabled="!url"
            class="flex-1 bg-primary-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            @click="startVenueInfoScraper"
          >
            Scrape Venue Info from URL
          </button>

          <!-- Cancel button when running -->
          <button
            v-if="status === 'running'"
            class="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
            @click="cancelScraping"
          >
            Cancel
          </button>
        </div>
      </div>

      <!-- Event Scraper Section (shown after venue created) -->
      <div v-if="showEventScraper && !showManualForm">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Events Page URL
          </label>
          <input
            v-model="url"
            type="url"
            placeholder="https://example.com/events"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            :disabled="status === 'running'"
          >
        </div>

        <!-- Provider Selection for Event Scraper -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">AI Provider</label>
            <select
              v-model="selectedProvider"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              :disabled="status === 'running'"
            >
              <option
                v-for="provider in providers"
                :key="provider.provider"
                :value="provider.provider"
              >
                {{ provider.provider }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Model</label>
            <select
              v-model="selectedModel"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              :disabled="status === 'running'"
            >
              <option
                v-for="model in availableModels"
                :key="model.id"
                :value="model.id"
              >
                {{ model.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Max Iterations</label>
            <input
              v-model.number="maxIterations"
              type="number"
              min="1"
              max="10"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              :disabled="status === 'running'"
            >
          </div>
        </div>

        <!-- Start Event Scraper Button -->
        <div class="flex gap-3">
          <button
            v-if="status === 'idle'"
            :disabled="!url"
            class="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            @click="startEventScraper"
          >
            Start Event Scraper for {{ venueData?.name || 'Venue' }}
          </button>

          <button
            v-else-if="status === 'success' && sessionType === 'VENUE_INFO'"
            class="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
            @click="startEventScraper"
          >
            Continue to Event Scraper
          </button>

          <!-- Cancel button when running -->
          <button
            v-if="status === 'running'"
            class="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
            @click="cancelScraping"
          >
            Cancel
          </button>
        </div>
      </div>

      <!-- Update Mode Start Button -->
      <div
        v-if="mode === 'update'"
        class="flex gap-3"
      >
        <!-- Update mode: prompt to select venue first -->
        <button
          v-if="!selectedExistingVenue && status !== 'running'"
          disabled
          class="flex-1 bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold cursor-not-allowed"
        >
          Select a venue above to update its scraper
        </button>

        <button
          v-else-if="showEventScraper && status === 'idle'"
          :disabled="!url"
          class="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          @click="startEventScraper"
        >
          {{ mode === 'update' ? 'Regenerate' : 'Start' }} Event Scraper for {{ venueData?.name || 'Existing Venue' }}
        </button>
      </div>
    </div>

    <!-- Sticky Status Bar (when running or executing) -->
    <div
      v-if="status === 'running' || status === 'executing'"
      class="sticky top-0 z-10 bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 shadow-sm"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          <div class="font-medium text-blue-900">
            <template v-if="status === 'executing'">
              Running scraper...
            </template>
            <template v-else>
              {{ currentStatusLabel }} (Attempt {{ currentAttempt }}/{{ maxIterations }})
            </template>
          </div>
        </div>
        <div
          v-if="completenessScore > 0 && status === 'running'"
          class="text-sm text-blue-600 font-medium"
        >
          {{ Math.round(completenessScore * 100) }}% complete
        </div>
      </div>
    </div>

    <!-- Preview Section -->
    <div v-if="status !== 'idle'">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold">
            {{ sessionType === 'VENUE_INFO' ? 'Venue Preview' : 'Events Preview' }}
          </h2>
        </div>

        <!-- Venue Card (only show for VENUE_INFO sessions) -->
        <div
          v-if="venueData && sessionType === 'VENUE_INFO'"
          class="border rounded-lg p-4 mb-4"
        >
          <!-- Image Preview -->
          <div
            v-if="venueData.imageUrl"
            class="mb-4"
          >
            <img
              :src="venueData.imageUrl"
              :alt="venueData.name"
              class="w-full h-48 object-cover rounded-lg"
            >
          </div>

          <h3 class="text-lg font-semibold mb-4">
            {{ venueData.name || 'Unknown Venue' }}
          </h3>

          <div class="space-y-3 text-sm">
            <!-- Required Fields -->
            <div>
              <label class="block font-medium mb-1">Name: <span class="text-red-500">*</span></label>
              <input
                v-model="venueData.name"
                type="text"
                placeholder="Venue name"
                class="w-full px-3 py-1.5 border rounded"
                :class="venueData.name ? 'border-gray-300' : 'border-red-300 bg-red-50'"
              >
            </div>

            <div>
              <label class="block font-medium mb-1">Website: <span class="text-red-500">*</span></label>
              <input
                v-model="venueData.website"
                type="url"
                placeholder="https://..."
                class="w-full px-3 py-1.5 border rounded"
                :class="venueData.website ? 'border-gray-300' : 'border-red-300 bg-red-50'"
              >
            </div>

            <!-- Optional Fields -->
            <div>
              <label class="block font-medium mb-1">Address:</label>
              <input
                v-model="venueData.address"
                type="text"
                placeholder="Street address"
                class="w-full px-3 py-1.5 border border-gray-300 rounded"
              >
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-medium mb-1">City:</label>
                <input
                  v-model="venueData.city"
                  type="text"
                  placeholder="City"
                  class="w-full px-3 py-1.5 border border-gray-300 rounded"
                >
              </div>
              <div>
                <label class="block font-medium mb-1">State:</label>
                <input
                  v-model="venueData.state"
                  type="text"
                  placeholder="State"
                  class="w-full px-3 py-1.5 border border-gray-300 rounded"
                >
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-medium mb-1">Postal Code:</label>
                <input
                  v-model="venueData.postalCode"
                  type="text"
                  placeholder="Zip"
                  class="w-full px-3 py-1.5 border border-gray-300 rounded"
                >
              </div>
              <div>
                <label class="block font-medium mb-1">Phone:</label>
                <input
                  v-model="venueData.phone"
                  type="tel"
                  placeholder="Phone"
                  class="w-full px-3 py-1.5 border border-gray-300 rounded"
                >
              </div>
            </div>

            <div>
              <label class="block font-medium mb-1">Venue Type:</label>
              <select
                v-model="venueData.venueType"
                class="w-full px-3 py-1.5 border border-gray-300 rounded"
              >
                <option :value="undefined">
                  Select type...
                </option>
                <option value="BAR">
                  Bar
                </option>
                <option value="CLUB">
                  Club
                </option>
                <option value="THEATER">
                  Theater
                </option>
                <option value="CONCERT_HALL">
                  Concert Hall
                </option>
                <option value="OUTDOOR">
                  Outdoor
                </option>
                <option value="CAFE">
                  Cafe
                </option>
                <option value="RESTAURANT">
                  Restaurant
                </option>
                <option value="HOUSE_SHOW">
                  House Show
                </option>
                <option value="OTHER">
                  Other
                </option>
              </select>
            </div>

            <div>
              <label class="block font-medium mb-1">Capacity:</label>
              <input
                v-model.number="venueData.capacity"
                type="number"
                placeholder="Capacity"
                class="w-full px-3 py-1.5 border border-gray-300 rounded"
              >
            </div>

            <div>
              <label class="block font-medium mb-1">Image URL:</label>
              <input
                v-model="venueData.imageUrl"
                type="url"
                placeholder="https://..."
                class="w-full px-3 py-1.5 border border-gray-300 rounded"
              >
            </div>

            <div>
              <label class="block font-medium mb-1">Description:</label>
              <textarea
                v-model="venueData.description"
                placeholder="Description"
                rows="3"
                class="w-full px-3 py-1.5 border border-gray-300 rounded"
              />
            </div>
          </div>

          <!-- Completeness Score -->
          <div class="mt-4">
            <div class="flex justify-between text-sm mb-1">
              <span>Completeness</span>
              <span>{{ Math.round(completenessScore * 100) }}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="h-2 rounded-full"
                :class="{
                  'bg-green-600': completenessScore >= 0.7,
                  'bg-yellow-600': completenessScore >= 0.4 && completenessScore < 0.7,
                  'bg-red-600': completenessScore < 0.4,
                }"
                :style="{ width: `${completenessScore * 100}%` }"
              />
            </div>
          </div>
        </div>

        <!-- Events List -->
        <div v-if="eventData && eventData.length > 0">
          <div class="text-sm text-gray-600 mb-3">
            <TransitionGroup name="count">
              <span :key="eventData.length">{{ eventData.length }} events found</span>
            </TransitionGroup>
          </div>
          <div class="space-y-4 max-h-[600px] overflow-y-auto">
            <TransitionGroup name="event-list">
              <EventCard
                v-for="(event, index) in eventData"
                :key="event.sourceUrl || index"
                :event="adaptScrapedEvent(event, index)"
                class="event-card-enter"
              />
            </TransitionGroup>
          </div>
        </div>

        <!-- Failed State with Retry Option -->
        <div
          v-else-if="status === 'failed'"
          class="text-center py-8"
        >
          <p class="text-red-600 font-semibold mb-2">
            Unable to scrape this website
          </p>
          <p class="text-sm text-gray-600 mb-6">
            {{ errorMessage }}
          </p>

          <!-- Retry with feedback for failed attempts -->
          <div class="max-w-lg mx-auto">
            <div
              v-if="!showFeedbackInput"
              class="space-y-3"
            >
              <button
                class="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700"
                @click="feedbackText = lastSubmittedFeedback; showFeedbackInput = true"
              >
                Retry with Feedback
              </button>
              <button
                class="w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 border border-gray-300"
                @click="sessionType === 'VENUE_INFO' ? startVenueInfoScraper() : startEventScraper()"
              >
                Retry Without Changes
              </button>
            </div>
            <div
              v-else
              class="border border-blue-200 bg-blue-50 rounded-lg p-4 text-left"
            >
              <label class="block text-sm font-medium text-blue-900 mb-2">
                What should the scraper do differently?
              </label>
              <textarea
                v-model="feedbackText"
                placeholder="e.g., The events are loaded dynamically - try waiting for the calendar to load. Or: Click the 'See All Events' button first."
                rows="3"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <div class="flex gap-2 mt-3">
                <button
                  :disabled="!feedbackText.trim()"
                  class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                  @click="retryWithFeedback"
                >
                  Retry
                </button>
                <button
                  class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  @click="showFeedbackInput = false; feedbackText = ''"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else-if="status === 'success' && !venueData && !eventData"
          class="text-center py-8"
        >
          <p class="text-yellow-600 font-semibold">
            No data extracted
          </p>
        </div>

        <!-- Action Buttons -->
        <div
          v-if="status === 'success' && (venueData || eventData)"
          class="mt-6 space-y-3"
        >
          <!-- Venue selector for event scrapers without a linked venue -->
          <div
            v-if="sessionType === 'EVENT_SCRAPER' && !existingVenueId && availableVenues.length > 0"
            class="border border-yellow-200 bg-yellow-50 rounded-lg p-4"
          >
            <label class="block text-sm font-medium text-yellow-900 mb-2">
              Link to Venue (required to save scraper)
            </label>
            <select
              v-model="existingVenueId"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option :value="null">
                Select a venue...
              </option>
              <option
                v-for="venue in availableVenues"
                :key="venue.id"
                :value="venue.id"
              >
                {{ venue.name }} ({{ venue.region?.name || 'Unknown region' }})
              </option>
            </select>
          </div>

          <!-- Approve buttons -->
          <button
            v-if="sessionType === 'VENUE_INFO'"
            class="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
            @click="approveVenue"
          >
            Approve and Create Venue
          </button>
          <button
            v-else-if="sessionType === 'EVENT_SCRAPER'"
            :disabled="!existingVenueId"
            class="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            @click="approveScraper"
          >
            {{ existingVenueId ? 'Approve and Save Scraper' : 'Select a venue first' }}
          </button>

          <!-- Retry with feedback -->
          <div v-if="!showFeedbackInput">
            <button
              class="w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 border border-gray-300"
              @click="feedbackText = lastSubmittedFeedback; showFeedbackInput = true"
            >
              Retry with Feedback
            </button>
          </div>
          <div
            v-else
            class="border border-blue-200 bg-blue-50 rounded-lg p-4"
          >
            <label class="block text-sm font-medium text-blue-900 mb-2">
              What should the scraper do differently?
            </label>
            <textarea
              v-model="feedbackText"
              placeholder="e.g., Descriptions are behind the info button - click it to expand each event and get the full description"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <div class="flex gap-2 mt-3">
              <button
                :disabled="!feedbackText.trim()"
                class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                @click="retryWithFeedback"
              >
                Retry
              </button>
              <button
                class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                @click="showFeedbackInput = false; feedbackText = ''"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Saved Success State -->
          <div
            v-if="savedVenueId"
            class="border border-green-200 bg-green-50 rounded-lg p-4 mt-4"
          >
            <div class="flex items-center gap-2 text-green-800 mb-3">
              <svg
                class="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="font-semibold">Scraper saved successfully!</span>
            </div>
            <p class="text-green-700 text-sm mb-4">
              Found {{ savedEventCount }} events for {{ venueData?.name || 'this venue' }}.
            </p>
            <button
              class="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
              @click="resetForNewVenue"
            >
              Add Another Venue
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Attempts Review Modal -->
    <div
      v-if="showAttemptsModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="showAttemptsModal = false"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 class="text-2xl font-bold">
            All Scraper Attempts
          </h2>
          <button
            class="text-gray-500 hover:text-gray-700 text-2xl"
            @click="showAttemptsModal = false"
          >
            ×
          </button>
        </div>

        <div
          v-if="attemptsData"
          class="p-6"
        >
          <!-- Conflicts Section -->
          <div
            v-if="attemptsData.mergeResult?.conflicts?.length > 0"
            class="mb-6"
          >
            <h3 class="text-lg font-semibold text-yellow-600 mb-3">
              ⚠️ Conflicts Found ({{ attemptsData.mergeResult.conflicts.length }})
            </h3>
            <p class="text-sm text-gray-600 mb-4">
              Different attempts extracted different values for these fields. The latest attempt's value is used by default.
            </p>

            <div class="space-y-4">
              <div
                v-for="conflict in attemptsData.mergeResult.conflicts"
                :key="conflict.field"
                class="border border-yellow-300 rounded-lg p-4 bg-yellow-50"
              >
                <div class="font-semibold text-gray-800 mb-2">
                  {{ conflict.field }}
                </div>
                <div class="space-y-2">
                  <div
                    v-for="item in conflict.values"
                    :key="item.attemptNumber"
                    class="flex items-start gap-3 p-2 bg-white rounded"
                  >
                    <span class="text-xs font-medium text-gray-500 min-w-[80px]">
                      Attempt {{ item.attemptNumber }}:
                    </span>
                    <span class="flex-1 break-words">{{ item.value }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- All Attempts -->
          <div>
            <h3 class="text-lg font-semibold mb-3">
              All Attempts ({{ attemptsData.attempts.length }})
            </h3>
            <div class="space-y-4">
              <div
                v-for="attempt in attemptsData.attempts"
                :key="attempt.id"
                class="border rounded-lg p-4"
                :class="attempt.attemptNumber === attemptsData.session.currentIteration ? 'border-green-500 bg-green-50' : 'border-gray-300'"
              >
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <span class="font-semibold">Attempt {{ attempt.attemptNumber }}</span>
                    <span
                      v-if="attempt.attemptNumber === attemptsData.session.currentIteration"
                      class="ml-2 text-xs bg-green-600 text-white px-2 py-1 rounded"
                    >
                      Final
                    </span>
                  </div>
                  <div class="text-right text-sm">
                    <div>Score: {{ (attempt.completenessScore * 100).toFixed(0) }}%</div>
                    <div class="text-xs text-gray-500">
                      {{ attempt.executionTime }}ms
                    </div>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4 mt-3 text-sm">
                  <div>
                    <div class="font-medium text-green-600">
                      Found ({{ attempt.fieldsFound.length }})
                    </div>
                    <div class="text-xs text-gray-600">
                      {{ attempt.fieldsFound.join(', ') }}
                    </div>
                  </div>
                  <div>
                    <div class="font-medium text-red-600">
                      Missing ({{ attempt.fieldsMissing.length }})
                    </div>
                    <div class="text-xs text-gray-600">
                      {{ attempt.fieldsMissing.join(', ') }}
                    </div>
                  </div>
                </div>

                <!-- Show extracted data -->
                <details class="mt-3">
                  <summary class="cursor-pointer text-sm text-blue-600 hover:text-blue-700">
                    View extracted data
                  </summary>
                  <pre class="mt-2 text-xs bg-gray-100 p-3 rounded overflow-x-auto">{{ JSON.stringify(attempt.scrapedData, null, 2) }}</pre>
                </details>
              </div>
            </div>
          </div>

          <!-- Merged Data Preview -->
          <div
            v-if="attemptsData.mergeResult"
            class="mt-6 border-t pt-6"
          >
            <h3 class="text-lg font-semibold mb-3">
              Merged Result
            </h3>
            <p class="text-sm text-gray-600 mb-3">
              This is what will be used if you approve. Fields are taken from the best sources across all attempts.
            </p>
            <pre class="text-xs bg-gray-100 p-4 rounded overflow-x-auto">{{ JSON.stringify(attemptsData.mergeResult.mergedData, null, 2) }}</pre>
          </div>
        </div>

        <div
          v-else
          class="p-6 text-center text-gray-500"
        >
          Loading attempts...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Event list transitions */
.event-list-enter-active {
  transition: all 0.4s ease-out;
}
.event-list-leave-active {
  transition: all 0.3s ease-in;
}
.event-list-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}
.event-list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.event-list-move {
  transition: transform 0.3s ease;
}

/* Count transition */
.count-enter-active,
.count-leave-active {
  transition: all 0.3s ease;
}
.count-enter-from {
  opacity: 0;
  transform: scale(1.2);
}
.count-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

/* Flash animation for updated fields */
@keyframes flash-update {
  0% { background-color: rgb(254 249 195); }
  100% { background-color: transparent; }
}
.field-updated {
  animation: flash-update 1s ease-out;
}
</style>
