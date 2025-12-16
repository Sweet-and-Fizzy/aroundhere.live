<script setup lang="ts">
interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: Array<{ type: 'text'; text: string }>
}

const messages = ref<UIMessage[]>([])
const input = ref('')
const status = ref<'ready' | 'submitted' | 'streaming' | 'error'>('ready')
const sessionId = ref<string | null>(null)

// Persist messages to localStorage
const STORAGE_KEY = 'aroundhere_chat_history'
const SESSION_KEY = 'aroundhere_chat_session'

onMounted(() => {
  // Load from localStorage
  const savedMessages = localStorage.getItem(STORAGE_KEY)
  const savedSession = localStorage.getItem(SESSION_KEY)

  if (savedMessages) {
    try {
      const parsed = JSON.parse(savedMessages)
      // Convert old format to new format if needed
      messages.value = parsed.map((msg: UIMessage | { role: string; content: string }, i: number) => {
        if ('parts' in msg) return msg
        return {
          id: `msg-${i}`,
          role: msg.role,
          content: msg.content,
          parts: [{ type: 'text', text: msg.content }],
        }
      })
    } catch {
      // Ignore parse errors
    }
  }

  if (savedSession) {
    sessionId.value = savedSession
  }
})

// Save messages when they change
watch(
  messages,
  (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  },
  { deep: true }
)

async function handleSubmit(e?: Event) {
  e?.preventDefault()
  const prompt = input.value.trim()
  if (!prompt || status.value === 'submitted') return

  const userMessage: UIMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: prompt,
    parts: [{ type: 'text', text: prompt }],
  }
  messages.value.push(userMessage)
  input.value = ''
  status.value = 'submitted'

  try {
    // Send to API with simple format
    const apiMessages = messages.value.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const { response, sessionId: newSessionId } = await $fetch('/api/chat', {
      method: 'POST',
      body: {
        messages: apiMessages,
        sessionId: sessionId.value,
      },
    })

    // Save session ID
    if (newSessionId && !sessionId.value) {
      sessionId.value = newSessionId
      localStorage.setItem(SESSION_KEY, newSessionId)
    }

    // Add assistant response
    const assistantMessage: UIMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: response,
      parts: [{ type: 'text', text: response }],
    }
    messages.value.push(assistantMessage)
    status.value = 'ready'
  } catch (err) {
    console.error('Chat error:', err)
    const errorMessage: UIMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'Sorry, something went wrong. Please try again.',
      parts: [{ type: 'text', text: 'Sorry, something went wrong. Please try again.' }],
    }
    messages.value.push(errorMessage)
    status.value = 'error'
  }
}

function clearHistory() {
  messages.value = []
  sessionId.value = null
  status.value = 'ready'
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(SESSION_KEY)
}

// Quick chat prompts
const quickChats = [
  { label: 'Jazz this weekend?', icon: 'i-heroicons-musical-note' },
  { label: "What's at Iron Horse?", icon: 'i-heroicons-building-storefront' },
  { label: 'Rock concerts', icon: 'i-heroicons-speaker-wave' },
  { label: 'Venues in Northampton', icon: 'i-heroicons-map-pin' },
]

function createChat(prompt: string) {
  input.value = prompt
  handleSubmit()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <UIcon
          name="i-heroicons-chat-bubble-left-right"
          class="w-5 h-5 text-primary-500"
        />
        <h2 class="font-semibold text-gray-900 dark:text-white">
          Ask about shows
        </h2>
      </div>
      <UButton
        v-if="messages.length > 0"
        icon="i-heroicons-trash"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="clearHistory"
      />
    </div>

    <!-- Content Area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Empty state -->
      <div
        v-if="messages.length === 0"
        class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 p-4 sm:p-6"
      >
        <h1 class="text-2xl sm:text-3xl text-gray-900 dark:text-white font-bold text-center">
          What shows are you looking for?
        </h1>

        <UChatPrompt
          v-model="input"
          :status="status === 'submitted' ? 'streaming' : 'ready'"
          variant="subtle"
          placeholder="Ask about shows, venues, artists..."
          @submit="handleSubmit"
        >
          <UChatPromptSubmit color="neutral" />
        </UChatPrompt>

        <div class="flex flex-wrap gap-2 justify-center">
          <UButton
            v-for="quickChat in quickChats"
            :key="quickChat.label"
            :icon="quickChat.icon"
            :label="quickChat.label"
            size="sm"
            color="white"
            variant="outline"
            class="rounded-full"
            @click="createChat(quickChat.label)"
          />
        </div>
      </div>

      <!-- Chat Messages -->
      <template v-else>
        <UChatMessages
          :messages="messages"
          :status="status"
          :should-auto-scroll="true"
          :user="{ side: 'right', variant: 'soft' }"
          :assistant="{ side: 'left', variant: 'naked', icon: 'i-heroicons-musical-note' }"
          :spacing-offset="80"
          class="flex-1 px-4 py-4 overflow-y-auto min-h-0"
        />
      </template>
    </div>

    <!-- Input fixed at bottom (always visible when there are messages) -->
    <div
      v-if="messages.length > 0"
      class="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900"
    >
      <UChatPrompt
        v-model="input"
        :status="status === 'submitted' ? 'streaming' : 'ready'"
        variant="subtle"
        placeholder="Ask about shows, venues, artists..."
        class="rounded-lg"
        @submit="handleSubmit"
      >
        <template #footer>
          <UChatPromptSubmit
            :status="status"
            color="neutral"
          />
        </template>
      </UChatPrompt>
    </div>
  </div>
</template>
