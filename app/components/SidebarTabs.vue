<script setup lang="ts">
import { nextTick } from 'vue'

defineProps<{
  venues?: { id: string; name: string; slug: string; city?: string | null; latitude?: number | null; longitude?: number | null }[]
  genres?: string[]
  genreLabels?: Record<string, string>
  facets?: {
    venueCounts: Record<string, number>
    genreCounts: Record<string, number>
    typeCounts: Record<string, number>
    cityCounts: Record<string, number>
    cityRegions: Record<string, string>
    regionNames?: Record<string, string>
    musicCount: number
    nonMusicCount: number
  }
  resultCount?: number
}>()

const emit = defineEmits<{
  filter: [filters: Record<string, any>]
  tabChange: [tab: 'filters' | 'chat']
}>()

const STORAGE_KEY = 'sidebarActiveTab'

// Load active tab from localStorage
function loadActiveTab(): 'filters' | 'chat' {
  if (import.meta.client) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'chat' || saved === 'filters') {
        return saved
      }
    } catch {
      // Ignore errors
    }
  }
  return 'filters'
}

const activeTab = ref<'filters' | 'chat'>(loadActiveTab())

// Save active tab to localStorage and scroll chat to bottom
watch(activeTab, (newTab) => {
  if (import.meta.client) {
    localStorage.setItem(STORAGE_KEY, newTab)
  }

  // Scroll to bottom when switching to chat tab
  if (newTab === 'chat') {
    nextTick(() => {
      chatRef.value?.scrollToBottom()
    })
  }
})

// Emit tab changes so parent can adjust width
watch(activeTab, (newTab) => {
  emit('tabChange', newTab)
}, { immediate: true })

// Ref to filters component for parent access
const filtersRef = ref<{ resetFilters: () => void; clearFiltersKeepSearch: () => void } | null>(null)

// Ref to chat component for parent access
const chatRef = ref<{ sendMessage: (message: string) => void; scrollToBottom: () => void } | null>(null)

// Open chat tab and send a message
function openChatWithMessage(message: string) {
  activeTab.value = 'chat'
  // Use nextTick to ensure chat component is visible before sending
  nextTick(() => {
    chatRef.value?.sendMessage(message)
    // Scroll after a delay to ensure the panel is fully rendered
    setTimeout(() => {
      chatRef.value?.scrollToBottom()
    }, 200)
  })
}

// Expose methods from filters component
defineExpose({
  resetFilters: () => filtersRef.value?.resetFilters(),
  clearFiltersKeepSearch: () => filtersRef.value?.clearFiltersKeepSearch(),
  openChatWithMessage,
})

function handleFilter(filters: Record<string, any>) {
  emit('filter', filters)
}
</script>

<template>
  <div
    class="sidebar-tabs"
    :class="{ 'chat-active': activeTab === 'chat' }"
  >
    <!-- Tab Headers -->
    <div class="tab-headers">
      <button
        class="tab-header"
        :class="{ active: activeTab === 'filters' }"
        @click="activeTab = 'filters'"
      >
        <UIcon
          name="i-heroicons-adjustments-horizontal"
          class="w-4 h-4"
        />
        Filters
      </button>
      <button
        class="tab-header"
        :class="{ active: activeTab === 'chat' }"
        @click="activeTab = 'chat'"
      >
        <UIcon
          name="i-heroicons-chat-bubble-left-right"
          class="w-4 h-4"
        />
        Chat
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Filters Tab -->
      <div
        v-show="activeTab === 'filters'"
        class="tab-panel"
      >
        <EventFiltersSidebar
          ref="filtersRef"
          :venues="venues"
          :genres="genres"
          :genre-labels="genreLabels"
          :facets="facets"
          :result-count="resultCount"
          @filter="handleFilter"
        />
      </div>

      <!-- Chat Tab -->
      <div
        v-show="activeTab === 'chat'"
        class="tab-panel chat-panel"
      >
        <ChatInterface ref="chatRef" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar-tabs {
  display: flex;
  flex-direction: column;
}

.sidebar-tabs.chat-active {
  height: 100%;
}

.tab-headers {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.tab-header {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  background: white;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-header:hover {
  color: #374151;
  background: #f9fafb;
}

.tab-header.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  background: white;
}

.tab-content {
  min-height: 0;
  overflow: hidden;
}

.chat-active .tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.tab-panel {
}

.chat-active .tab-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-panel:not(.chat-panel) {
  padding: 0 1rem 1rem 1rem;
  overflow-y: auto;
  max-height: calc(100vh - 8rem);
}

.chat-panel {
  padding: 0;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Smooth scrollbar for filters */
.tab-panel:not(.chat-panel)::-webkit-scrollbar {
  width: 0.375rem;
}

.tab-panel:not(.chat-panel)::-webkit-scrollbar-track {
  background: #f9fafb;
}

.tab-panel:not(.chat-panel)::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 0.1875rem;
}

.tab-panel:not(.chat-panel)::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
