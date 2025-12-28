<script setup lang="ts">
const props = defineProps<{
  title: string
  sectionKey: string
  isExpanded: boolean
  badge?: string | number
  badgeColor?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
}>()

const emit = defineEmits<{
  toggle: [sectionKey: string]
}>()

function handleToggle() {
  emit('toggle', props.sectionKey)
}
</script>

<template>
  <div class="border-b border-gray-200 py-3">
    <button
      type="button"
      class="flex w-full items-center justify-between text-left"
      :aria-expanded="isExpanded"
      :aria-controls="`filter-section-${sectionKey}`"
      @click="handleToggle"
    >
      <span class="text-sm font-medium text-gray-900">
        {{ title }}
      </span>
      <span class="flex items-center gap-2">
        <UBadge
          v-if="badge !== undefined && badge !== 0 && badge !== ''"
          :color="badgeColor || 'primary'"
          size="sm"
          variant="soft"
        >
          {{ badge }}
        </UBadge>
        <UIcon
          :name="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
          class="h-5 w-5 text-gray-400"
        />
      </span>
    </button>
    <div
      v-show="isExpanded"
      :id="`filter-section-${sectionKey}`"
      class="mt-3"
    >
      <slot />
    </div>
  </div>
</template>
