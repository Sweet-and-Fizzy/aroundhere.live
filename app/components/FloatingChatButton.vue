<script setup lang="ts">
import { nextTick } from 'vue'

defineProps<{
  alwaysVisible?: boolean
}>()

const showChat = ref(false)
const chatRef = ref<{ sendMessage: (message: string) => void; scrollToBottom: () => void } | null>(null)

function toggleChat() {
  showChat.value = !showChat.value
}

function closeChat() {
  showChat.value = false
}

function openWithMessage(message: string) {
  showChat.value = true
  nextTick(() => {
    chatRef.value?.sendMessage(message)
    setTimeout(() => {
      chatRef.value?.scrollToBottom()
    }, 200)
  })
}

defineExpose({
  openWithMessage,
})

// Close on escape key
function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && showChat.value) {
    closeChat()
  }
}

onMounted(() => {
  if (import.meta.client) {
    window.addEventListener('keydown', handleEscape)
  }
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('keydown', handleEscape)
  }
})
</script>

<template>
  <div
    class="floating-chat"
    :class="{ 'always-visible': alwaysVisible }"
  >
    <!-- Floating Button -->
    <button
      class="chat-fab"
      :class="{ open: showChat }"
      @click="toggleChat"
    >
      <UIcon
        v-if="!showChat"
        name="i-heroicons-chat-bubble-left-right"
        class="w-5 h-5"
      />
      <UIcon
        v-else
        name="i-heroicons-x-mark"
        class="w-5 h-5"
      />
    </button>

    <!-- Chat Drawer -->
    <Teleport to="body">
      <!-- Backdrop -->
      <div
        v-if="showChat"
        class="chat-backdrop"
        :class="{ 'always-visible': alwaysVisible }"
        @click="closeChat"
      />

      <!-- Drawer -->
      <div
        class="chat-drawer"
        :class="{ open: showChat, 'always-visible': alwaysVisible }"
      >
        <div class="chat-drawer-header">
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
            class="chat-drawer-close"
            @click="closeChat"
          >
            <UIcon
              name="i-heroicons-x-mark"
              class="w-5 h-5"
            />
          </button>
        </div>
        <div class="chat-drawer-content">
          <ChatInterface
            ref="chatRef"
            hide-header
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Floating Action Button */
.chat-fab {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: #2563eb;
  border: none;
  border-radius: 50%;
  box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.4), 0 8px 10px -6px rgba(37, 99, 235, 0.3);
  cursor: pointer;
  transition: all 0.2s;
  z-index: 40;
}

.chat-fab:hover {
  background: #1d4ed8;
  transform: scale(1.05);
  box-shadow: 0 15px 30px -5px rgba(37, 99, 235, 0.5), 0 10px 15px -6px rgba(37, 99, 235, 0.4);
}

.chat-fab:active {
  transform: scale(0.95);
}

.chat-fab.open {
  background: #6b7280;
}

.chat-fab.open:hover {
  background: #4b5563;
}

/* Backdrop */
.chat-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 40;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Drawer */
.chat-drawer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 85vh;
  max-height: none;
  background: white;
  border-radius: 1rem 1rem 0 0;
  box-shadow: 0 -10px 25px -5px rgba(0, 0, 0, 0.1);
  z-index: 50;
  display: flex;
  flex-direction: column;
  transform: translateY(calc(100% + 5rem));
  visibility: hidden;
  transition: transform 0.3s ease, visibility 0.3s;
}

.chat-drawer.open {
  transform: translateY(0);
  visibility: visible;
}

.chat-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.chat-drawer-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  color: #6b7280;
  background: none;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.chat-drawer-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.chat-drawer-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Tablet and larger - show as floating card flush with bottom */
@media (min-width: 640px) {
  .chat-drawer {
    bottom: 0;
    right: 1.5rem;
    left: auto;
    width: 400px;
    height: 70vh;
    max-height: 600px;
    border-radius: 1rem 1rem 0 0;
  }

  .chat-drawer.open {
    transform: translateY(0) scale(1);
  }

  /* Hide the FAB when chat is open on tablet */
  .chat-fab {
    transition: opacity 0.2s, transform 0.2s;
  }

  .chat-fab.open {
    opacity: 0;
    pointer-events: none;
    transform: scale(0.8);
  }
}

/* Desktop - hide on large screens since we have the sidebar tabs */
@media (min-width: 1024px) {
  .floating-chat:not(.always-visible) {
    display: none;
  }
}
</style>

<style>
/* Non-scoped styles for teleported elements - hide on desktop unless always-visible */
@media (min-width: 1024px) {
  .chat-backdrop:not(.always-visible),
  .chat-drawer:not(.always-visible) {
    display: none !important;
  }
}
</style>
