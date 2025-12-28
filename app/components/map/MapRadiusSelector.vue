<script setup lang="ts">
const props = defineProps<{
  modelValue: number | 'view'
  options?: (number | 'view')[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number | 'view']
}>()

const defaultOptions: (number | 'view')[] = ['view', 5, 10, 15, 25, 50, 100]
const radiusOptions = computed(() => props.options || defaultOptions)

function formatLabel(value: number | 'view'): string {
  if (value === 'view') return 'Map View'
  return `${value} mi`
}

function isSelected(value: number | 'view'): boolean {
  return props.modelValue === value
}

function select(value: number | 'view') {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <button
      v-for="option in radiusOptions"
      :key="String(option)"
      type="button"
      class="px-2 py-1 text-xs font-medium rounded transition-colors"
      :class="[
        isSelected(option)
          ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-500'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
      ]"
      @click="select(option)"
    >
      {{ formatLabel(option) }}
    </button>
  </div>
</template>
