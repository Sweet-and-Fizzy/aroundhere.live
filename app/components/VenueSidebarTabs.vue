<script setup lang="ts">
defineProps<{
  venues?: Array<{
    id: string
    name: string
    city?: string | null
    venueType: string
    verified: boolean
    _count?: { events: number }
  }>
}>()

const emit = defineEmits<{
  filter: [filters: Record<string, any>]
  tabChange: [tab: 'filters' | 'chat']
}>()

const STORAGE_KEY = 'venueSidebarActiveTab'

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

// Save active tab to localStorage
watch(activeTab, (newTab) => {
  if (import.meta.client) {
    localStorage.setItem(STORAGE_KEY, newTab)
  }
})

// Emit tab changes so parent can adjust width
watch(activeTab, (newTab) => {
  emit('tabChange', newTab)
}, { immediate: true })

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
        <VenueFiltersSidebar
          :venues="venues"
          @filter="handleFilter"
        />
      </div>

      <!-- Chat Tab -->
      <div
        v-show="activeTab === 'chat'"
        class="tab-panel chat-panel"
      >
        <ChatInterface />
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
}

.tab-panel {
}

.chat-active .tab-panel {
  height: 100%;
}

.tab-panel:not(.chat-panel) {
  padding: 1rem;
  overflow-y: auto;
}

.chat-panel {
  padding: 0;
  overflow: hidden;
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
