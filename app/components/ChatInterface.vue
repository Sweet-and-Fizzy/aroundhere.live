<script setup lang="ts">
const props = defineProps<{
  initialMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  hideHeader?: boolean
}>()

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const messages = ref<Message[]>(
  props.initialMessages?.map(m => ({ ...m, timestamp: new Date() })) || []
)
const input = ref('')
const loading = ref(false)
const sessionId = ref<string | undefined>(undefined)
const messagesContainer = ref<HTMLElement | null>(null)

// Latest message for screen readers
const latestMessage = computed(() => {
  const last = messages.value[messages.value.length - 1]
  if (!last) return ''
  return `${last.role === 'user' ? 'You' : 'Assistant'}: ${last.content}`
})

// Example queries to show when chat is empty
const exampleQueries = [
  "What shows are happening this weekend?",
  "Any jazz concerts at Iron Horse this month?",
  "Find me some punk shows in Northampton",
  "What's going on at The Drake tonight?",
]

// Load session from localStorage
const SESSION_KEY = 'chatSession'
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

onMounted(() => {
  if (import.meta.client) {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        const savedAt = data.savedAt ? new Date(data.savedAt).getTime() : 0
        const age = Date.now() - savedAt

        // Only restore session if it's less than 7 days old
        if (age < SESSION_TTL) {
          sessionId.value = data.sessionId
          messages.value = data.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }))
        } else {
          // Session expired, remove it
          localStorage.removeItem(SESSION_KEY)
        }
      }
    } catch {
      // Ignore parse errors
      localStorage.removeItem(SESSION_KEY)
    }
  }
})

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

// Scroll to bottom of messages
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

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
  scrollToBottom()

  loading.value = true

  try {
    const response = await $fetch('/api/chat', {
      method: 'POST',
      body: {
        messages: messages.value.map(m => ({ role: m.role, content: m.content })),
        sessionId: sessionId.value,
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
    scrollToBottom()
  } catch (error: any) {
    console.error('Chat error:', error)

    // Format error message based on type
    let errorMessage = 'Sorry, I encountered an error. Please try again.'

    if (error.statusCode === 429) {
      // Rate limit error - provide specific guidance
      const limitData = error.data
      if (limitData?.limitType === 'cost') {
        errorMessage = error.statusMessage || 'Usage limit reached. Please try again later.'
      } else {
        errorMessage = error.statusMessage || 'Too many requests. Please wait a moment and try again.'
      }
    } else if (error.statusCode === 408 || error.name === 'AbortError') {
      errorMessage = 'Request timed out. Please try again.'
    } else if (error.statusMessage) {
      errorMessage = error.statusMessage
    }

    // Add error message
    messages.value.push({
      role: 'assistant',
      content: errorMessage,
      timestamp: new Date(),
    })
    scrollToBottom()
  } finally {
    loading.value = false
  }
}

function startNewConversation() {
  messages.value = []
  sessionId.value = undefined
  if (import.meta.client) {
    localStorage.removeItem(SESSION_KEY)
  }
}

function useExampleQuery(query: string) {
  input.value = query
  sendMessage()
}

// Handle enter key
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <div class="chat-interface" @wheel.stop>
    <!-- Header -->
    <div v-if="!hideHeader" class="chat-header">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-primary-600" />
        <h3 class="font-semibold text-gray-900">AI Assistant</h3>
      </div>
      <button
        v-if="messages.length > 0"
        class="new-chat-btn"
        aria-label="Start new conversation"
        @click="startNewConversation"
      >
        <UIcon name="i-heroicons-plus" class="w-4 h-4" />
        New
      </button>
    </div>

    <!-- Messages -->
    <div ref="messagesContainer" class="messages-container" @wheel.stop>
      <!-- Empty state with examples -->
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-icon">
          <UIcon name="i-heroicons-sparkles" class="w-12 h-12 text-gray-400" />
        </div>
        <h4 class="empty-title">Ask me about local events</h4>
        <p class="empty-subtitle">Try asking:</p>
        <div class="example-queries">
          <button
            v-for="(query, i) in exampleQueries"
            :key="i"
            class="example-query-btn"
            @click="useExampleQuery(query)"
          >
            <UIcon name="i-heroicons-chat-bubble-left-ellipsis" class="w-4 h-4" />
            {{ query }}
          </button>
        </div>
      </div>

      <!-- Message list -->
      <div v-else class="messages-list">
        <div
          v-for="(message, i) in messages"
          :key="i"
          class="message"
          :class="message.role"
        >
          <div class="message-avatar">
            <UIcon
              :name="message.role === 'user' ? 'i-heroicons-user' : 'i-heroicons-sparkles'"
              class="w-4 h-4"
            />
          </div>
          <div class="message-content">
            <div class="message-text">
              <!-- User messages show as plain text -->
              <template v-if="message.role === 'user'">
                {{ message.content }}
              </template>
              <!-- Assistant messages render markdown -->
              <MDC v-else :value="message.content" class="prose prose-sm max-w-none" />
            </div>
            <div class="message-time">
              {{ message.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }}
            </div>
          </div>
        </div>

        <!-- Loading indicator -->
        <div v-if="loading" class="message assistant">
          <div class="message-avatar">
            <UIcon name="i-heroicons-sparkles" class="w-4 h-4 animate-pulse" />
          </div>
          <div class="message-content">
            <div class="typing-indicator">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="chat-input-container">
      <div class="chat-input-wrapper">
        <textarea
          v-model="input"
          placeholder="Ask about local events..."
          rows="1"
          class="chat-input"
          :disabled="loading"
          aria-label="Chat message input"
          role="textbox"
          aria-multiline="true"
          @keydown="handleKeydown"
        />
        <button
          class="send-btn"
          :disabled="!input.trim() || loading"
          :aria-label="loading ? 'Sending message...' : 'Send message'"
          @click="sendMessage"
        >
          <UIcon name="i-heroicons-paper-airplane" class="w-5 h-5" />
        </button>
      </div>
      <p class="chat-disclaimer">
        AI can make mistakes. Check event details before attending.
      </p>
    </div>

    <!-- Screen reader announcements -->
    <div aria-live="polite" aria-atomic="true" class="sr-only">
      {{ latestMessage }}
    </div>
  </div>
</template>

<style scoped>
.chat-interface {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #6b7280;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.new-chat-btn:hover {
  background: #f9fafb;
  color: #374151;
  border-color: #9ca3af;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  min-height: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem 1rem;
  height: 100%;
}

.empty-icon {
  margin-bottom: 1rem;
}

.empty-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;
}

.empty-subtitle {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;
}

.example-queries {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 320px;
}

.example-query-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  text-align: left;
  color: #374151;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
}

.example-query-btn:hover {
  background: #f9fafb;
  border-color: #2563eb;
  color: #2563eb;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  display: flex;
  gap: 0.75rem;
  animation: messageSlideIn 0.2s ease;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-avatar {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
}

.message.user .message-avatar {
  background: #dbeafe;
  color: #2563eb;
}

.message.assistant .message-avatar {
  background: #f3f4f6;
  color: #6b7280;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-text {
  font-size: 0.875rem;
  line-height: 1.5;
  color: #111827;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.message.user .message-text {
  background: #eff6ff;
  padding: 0.625rem 0.875rem;
  border-radius: 0.5rem;
  border: 1px solid #dbeafe;
}

.message.assistant .message-text {
  padding: 0.25rem 0;
}

/* Markdown styling for assistant messages */
.message.assistant .message-text :deep(.prose) {
  color: #111827;
  font-size: 0.875rem;
  line-height: 1.5;
}

.message.assistant .message-text :deep(.prose p) {
  margin-bottom: 0.5rem;
}

.message.assistant .message-text :deep(.prose p:last-child) {
  margin-bottom: 0;
}

.message.assistant .message-text :deep(.prose ul),
.message.assistant .message-text :deep(.prose ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.message.assistant .message-text :deep(.prose li) {
  margin: 0.25rem 0;
}

.message.assistant .message-text :deep(.prose strong) {
  font-weight: 600;
  color: #111827;
}

.message.assistant .message-text :deep(.prose em) {
  font-style: italic;
}

.message.assistant .message-text :deep(.prose code) {
  background: #f3f4f6;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.message.assistant .message-text :deep(.prose pre) {
  background: #f3f4f6;
  padding: 0.5rem;
  border-radius: 0.375rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.message.assistant .message-text :deep(.prose pre code) {
  background: none;
  padding: 0;
}

.message.assistant .message-text :deep(.prose a) {
  color: #2563eb;
  text-decoration: underline;
}

.message.assistant .message-text :deep(.prose a:hover) {
  color: #1d4ed8;
}

.message.assistant .message-text :deep(.prose h1),
.message.assistant .message-text :deep(.prose h2),
.message.assistant .message-text :deep(.prose h3) {
  font-weight: 600;
  margin: 0.75rem 0 0.5rem 0;
  color: #111827;
}

.message.assistant .message-text :deep(.prose h1) {
  font-size: 1.125rem;
}

.message.assistant .message-text :deep(.prose h2) {
  font-size: 1rem;
}

.message.assistant .message-text :deep(.prose h3) {
  font-size: 0.9375rem;
}

.message-time {
  font-size: 0.6875rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}

/* Typing indicator */
.typing-indicator {
  display: flex;
  gap: 0.25rem;
  padding: 0.625rem 0.875rem;
  background: #f3f4f6;
  border-radius: 0.5rem;
  width: fit-content;
}

.typing-indicator span {
  width: 0.375rem;
  height: 0.375rem;
  background: #9ca3af;
  border-radius: 50%;
  animation: typingBounce 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typingBounce {
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-0.375rem);
  }
}

/* Input */
.chat-input-container {
  flex-shrink: 0;
  padding: 0.75rem 1rem;
  border-top: 1px solid #e5e7eb;
  background: white;
}

.chat-input-wrapper {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
}

.chat-input {
  flex: 1;
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  resize: none;
  max-height: 120px;
  font-family: inherit;
  line-height: 1.5;
}

.chat-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.chat-input:disabled {
  background: #f9fafb;
  color: #9ca3af;
}

.send-btn {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: #2563eb;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
}

.send-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.send-btn:disabled {
  background: #e5e7eb;
  color: #9ca3af;
  cursor: not-allowed;
}

.chat-disclaimer {
  font-size: 0.6875rem;
  color: #9ca3af;
  text-align: center;
  margin-top: 0.5rem;
}

/* Scrollbar styling */
.messages-container::-webkit-scrollbar {
  width: 0.375rem;
}

.messages-container::-webkit-scrollbar-track {
  background: #f9fafb;
}

.messages-container::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 0.1875rem;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* Screen reader only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
