<script setup lang="ts">
const isVisible = ref(false)

function checkScroll() {
  isVisible.value = window.scrollY > 300
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', checkScroll)
  checkScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', checkScroll)
})
</script>

<template>
  <Transition name="fade">
    <button
      v-if="isVisible"
      class="fixed bottom-[5.5rem] lg:bottom-6 right-6 w-12 h-12 flex items-center justify-center bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-700 transition-colors z-40"
      title="Back to top"
      @click="scrollToTop"
    >
      <UIcon
        name="i-heroicons-arrow-up"
        class="w-5 h-5"
      />
    </button>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
