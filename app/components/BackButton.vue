<script setup lang="ts">
const router = useRouter()

defineProps<{
  variant?: 'default' | 'light'
}>()
</script>

<template>
  <button
    :class="[
      'inline-flex items-center gap-1 transition-colors',
      variant === 'light'
        ? 'text-white/70 hover:text-white text-sm'
        : 'text-gray-600 hover:text-gray-900'
    ]"
    @click="router.back()"
  >
    <UIcon
      name="i-heroicons-arrow-left"
      class="w-4 h-4"
    />
    Back
  </button>
</template>
