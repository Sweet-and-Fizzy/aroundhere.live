<script setup lang="ts">
defineProps<{
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}>()
</script>

<template>
  <div
    class="message"
    :class="role"
  >
    <div class="message-avatar">
      <UIcon
        :name="role === 'user' ? 'i-heroicons-user' : 'i-heroicons-sparkles'"
        class="w-4 h-4"
      />
    </div>
    <div class="message-content">
      <div class="message-text">
        <!-- User messages show as plain text -->
        <template v-if="role === 'user'">
          {{ content }}
        </template>
        <!-- Assistant messages render markdown -->
        <MDC
          v-else
          :value="content"
          class="prose prose-sm max-w-none"
        />
      </div>
      <div class="message-time">
        {{ timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.message.assistant .message-text :deep(.prose > *:first-child) {
  margin-top: 0;
}

.message.assistant .message-text :deep(.prose p) {
  margin-top: 0;
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
  text-decoration: none;
  border-bottom: 1px solid #2563eb;
}

.message.assistant .message-text :deep(.prose a:hover) {
  color: #1d4ed8;
  border-bottom-color: #1d4ed8;
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
</style>
