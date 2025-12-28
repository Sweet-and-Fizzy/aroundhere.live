<script setup lang="ts">
const emit = defineEmits<{
  selectQuery: [query: string]
}>()

const exampleQueries = [
  "What shows are happening this weekend?",
  "Any jazz concerts at Iron Horse this month?",
  "Find me some punk shows in Northampton",
  "What's going on at The Drake tonight?",
]

function selectQuery(query: string) {
  emit('selectQuery', query)
}
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      <UIcon
        name="i-heroicons-sparkles"
        class="w-12 h-12 text-gray-500"
      />
    </div>
    <h4 class="empty-title">
      Ask me about local events
    </h4>
    <p class="empty-subtitle">
      Try asking:
    </p>
    <div class="example-queries">
      <button
        v-for="(query, i) in exampleQueries"
        :key="i"
        class="example-query-btn"
        @click="selectQuery(query)"
      >
        <UIcon
          name="i-heroicons-chat-bubble-left-ellipsis"
          class="w-4 h-4"
        />
        {{ query }}
      </button>
    </div>
  </div>
</template>

<style scoped>
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
</style>
