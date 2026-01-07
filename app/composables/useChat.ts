
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SESSION_KEY = 'chatSession'
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

export function useChat(options: {
  initialMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  scrollToBottom?: () => void
} = {}) {
  const messages = ref<ChatMessage[]>(
    options.initialMessages?.map(m => ({ ...m, timestamp: new Date() })) || []
  )
  const input = ref('')
  const loading = ref(false)
  const sessionId = ref<string | undefined>(undefined)

  // Latest message for screen readers
  const latestMessage = computed(() => {
    const last = messages.value[messages.value.length - 1]
    if (!last) return ''
    return `${last.role === 'user' ? 'You' : 'Assistant'}: ${last.content}`
  })

  // Load session from localStorage on mount
  function loadSession() {
    if (!import.meta.client) return

    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        const savedAt = data.savedAt ? new Date(data.savedAt).getTime() : 0
        const age = Date.now() - savedAt

        // Only restore session if it's less than 7 days old
        if (age < SESSION_TTL) {
          sessionId.value = data.sessionId
          messages.value = data.messages.map((m: { role: 'user' | 'assistant'; content: string; timestamp: string }) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }))
        } else {
          localStorage.removeItem(SESSION_KEY)
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
  }

  // Save session to localStorage
  function saveSession() {
    if (import.meta.client && sessionId.value) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        sessionId: sessionId.value,
        messages: messages.value,
        savedAt: new Date().toISOString(),
      }))
    }
  }

  // Send a message
  async function sendMessage() {
    if (!input.value.trim() || loading.value) return

    const userMessage = input.value.trim()
    input.value = ''

    // Add user message
    messages.value.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    })
    options.scrollToBottom?.()

    loading.value = true

    try {
      const { regionName } = useCurrentRegion()
      // Get user's timezone from browser
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      const response = await $fetch('/api/chat', {
        method: 'POST',
        body: {
          messages: messages.value.map(m => ({ role: m.role, content: m.content })),
          sessionId: sessionId.value,
          regionName: regionName.value,
          timezone,
        },
        timeout: 30000, // 30 second timeout
      })

      // Store session ID for future messages
      sessionId.value = response.sessionId

      // Add assistant response
      messages.value.push({
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      })

      saveSession()
      options.scrollToBottom?.()
    } catch (error: unknown) {
      console.error('Chat error:', error)

      // Format error message based on type
      let errorMessage = 'Sorry, I encountered an error. Please try again.'
      const httpError = error as { statusCode?: number; statusMessage?: string; data?: { limitType?: string }; name?: string }

      if (httpError.statusCode === 429) {
        const limitData = httpError.data
        if (limitData?.limitType === 'cost') {
          errorMessage = httpError.statusMessage || 'Usage limit reached. Please try again later.'
        } else {
          errorMessage = httpError.statusMessage || 'Too many requests. Please wait a moment and try again.'
        }
      } else if (httpError.statusCode === 408 || httpError.name === 'AbortError') {
        errorMessage = 'Request timed out. Please try again.'
      } else if (httpError.statusMessage) {
        errorMessage = httpError.statusMessage
      }

      messages.value.push({
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
      })
      options.scrollToBottom?.()
    } finally {
      loading.value = false
    }
  }

  // Start a new conversation
  function startNewConversation() {
    messages.value = []
    sessionId.value = undefined
    if (import.meta.client) {
      localStorage.removeItem(SESSION_KEY)
    }
  }

  // Use an example query
  function useExampleQuery(query: string) {
    input.value = query
    sendMessage()
  }

  // Send message from external caller
  function sendMessageFromExternal(message: string) {
    input.value = message
    sendMessage()
    // Extra scroll after a delay to ensure panel is fully visible
    setTimeout(() => options.scrollToBottom?.(), 100)
  }

  return {
    messages,
    input,
    loading,
    sessionId,
    latestMessage,
    loadSession,
    saveSession,
    sendMessage,
    startNewConversation,
    useExampleQuery,
    sendMessageFromExternal,
  }
}
