<script setup lang="ts">
const props = defineProps<{
  text: string
  delay?: number  // ms between each character
  startDelay?: number  // ms before starting
}>()

const emit = defineEmits<{
  complete: []
}>()

const displayText = ref('')
const isComplete = ref(false)

let timeoutId: ReturnType<typeof setTimeout> | null = null

function typeText() {
  let index = 0
  displayText.value = ''
  isComplete.value = false

  function typeNextChar() {
    if (index < props.text.length) {
      displayText.value += props.text[index]
      index++
      timeoutId = setTimeout(typeNextChar, props.delay ?? 30)
    } else {
      isComplete.value = true
      emit('complete')
    }
  }

  timeoutId = setTimeout(typeNextChar, props.startDelay ?? 0)
}

// Start typing when text changes
watch(() => props.text, (newText) => {
  if (newText) {
    typeText()
  }
}, { immediate: true })

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId)
})
</script>

<template>
  <span class="typewriter">{{ displayText }}<span
    v-if="!isComplete"
    class="cursor"
  >|</span></span>
</template>

<style scoped>
.cursor {
  animation: blink 0.7s infinite;
  font-weight: 300;
  opacity: 0.7;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
</style>
