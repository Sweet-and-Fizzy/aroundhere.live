<script setup lang="ts">
import { nextTick } from 'vue'

const props = defineProps<{
  initialMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  hideHeader?: boolean
}>()

const messagesContainer = ref<HTMLElement | null>(null)
const messagesEndRef = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (messagesEndRef.value) {
      messagesEndRef.value.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  })
}

const {
  messages,
  input,
  loading,
  latestMessage,
  loadSession,
  sendMessage,
  startNewConversation,
  useExampleQuery,
  sendMessageFromExternal,
} = useChat({
  initialMessages: props.initialMessages,
  scrollToBottom,
})

onMounted(() => {
  loadSession()
})

// Expose methods for parent components
defineExpose({
  sendMessage: sendMessageFromExternal,
  scrollToBottom,
})
</script>

<template>
  <div
    class="chat-interface"
    @wheel.stop
  >
    <!-- Header -->
    <div
      v-if="!hideHeader"
      class="chat-header"
    >
      <div class="flex items-center gap-2">
        <UIcon
          name="i-heroicons-chat-bubble-left-right"
          class="w-5 h-5 text-primary-600"
        />
        <h3 class="font-semibold text-gray-900">
          Ask AroundHere
        </h3>
      </div>
      <button
        v-if="messages.length > 0"
        class="new-chat-btn"
        aria-label="Start new conversation"
        @click="startNewConversation"
      >
        <UIcon
          name="i-heroicons-plus"
          class="w-4 h-4"
        />
        New
      </button>
    </div>

    <!-- Messages -->
    <div
      ref="messagesContainer"
      class="messages-container"
      @wheel.stop
    >
      <!-- Empty state with examples -->
      <ChatEmptyState
        v-if="messages.length === 0"
        @select-query="useExampleQuery"
      />

      <!-- Message list -->
      <div
        v-else
        class="messages-list"
      >
        <ChatMessage
          v-for="(message, i) in messages"
          :key="i"
          :role="message.role"
          :content="message.content"
          :timestamp="message.timestamp"
        />

        <!-- Loading indicator -->
        <ChatTypingIndicator v-if="loading" />

        <!-- Scroll anchor -->
        <div ref="messagesEndRef" />
      </div>
    </div>

    <!-- Input -->
    <ChatInput
      v-model="input"
      :loading="loading"
      @send="sendMessage"
    />

    <!-- Screen reader announcements -->
    <div
      aria-live="polite"
      aria-atomic="true"
      class="sr-only"
    >
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
  max-height: 100%;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
