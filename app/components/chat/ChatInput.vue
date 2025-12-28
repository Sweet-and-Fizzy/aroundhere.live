<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  loading?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: []
}>()

const inputValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    emit('send')
  }
}

function handleSend() {
  emit('send')
}
</script>

<template>
  <div class="chat-input-container">
    <div class="chat-input-wrapper">
      <textarea
        v-model="inputValue"
        :placeholder="placeholder || 'Ask about local events...'"
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
        :disabled="!inputValue.trim() || loading"
        :aria-label="loading ? 'Sending message...' : 'Send message'"
        @click="handleSend"
      >
        <UIcon
          name="i-heroicons-paper-airplane"
          class="w-5 h-5"
        />
      </button>
    </div>
    <p class="chat-disclaimer">
      Always verify event details before attending.
    </p>
  </div>
</template>

<style scoped>
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
</style>
