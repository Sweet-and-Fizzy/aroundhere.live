<script setup lang="ts">
const props = defineProps<{
  modelValue: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const options = [
  { label: 'All My Events', value: 'all', icon: 'i-heroicons-calendar' },
  { label: 'Interested', value: 'interested', icon: 'i-heroicons-star' },
  { label: 'Going', value: 'going', icon: 'i-heroicons-check-circle' },
]

function isSelected(value: string): boolean {
  return props.modelValue === value
}

function toggle(value: string) {
  if (isSelected(value)) {
    emit('update:modelValue', null)
  } else {
    emit('update:modelValue', value)
  }
}
</script>

<template>
  <div class="space-y-2">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="[
        isSelected(option.value)
          ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-500'
          : 'bg-gray-50 text-gray-700 hover:bg-gray-100',
      ]"
      @click="toggle(option.value)"
    >
      <UIcon
        :name="option.icon"
        class="w-4 h-4"
        :class="[
          option.value === 'interested' && isSelected(option.value) ? 'text-amber-500' : '',
          option.value === 'going' && isSelected(option.value) ? 'text-green-500' : '',
        ]"
      />
      {{ option.label }}
    </button>

    <p class="text-xs text-gray-500 mt-2">
      Shows events you've marked as interested or going.
    </p>
  </div>
</template>
