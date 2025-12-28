<script setup lang="ts">
</script>

<template>
  <div class="message assistant">
    <div class="message-avatar">
      <UIcon
        name="i-heroicons-sparkles"
        class="w-4 h-4 animate-pulse"
      />
    </div>
    <div class="message-content">
      <div class="typing-indicator">
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  gap: 0.75rem;
}

.message-avatar {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: #f3f4f6;
  color: #6b7280;
}

.message-content {
  flex: 1;
  min-width: 0;
}

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
</style>
