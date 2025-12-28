<script setup lang="ts">
import { today, getLocalTimeZone } from '@internationalized/date'
import type { DateRange } from 'reka-ui'

type CalendarDateRange = DateRange | undefined

const props = defineProps<{
  modelValue: string
  customRange?: CalendarDateRange
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:customRange': [value: CalendarDateRange]
}>()

const showCustomCalendar = ref(false)

const datePresets = [
  { label: 'All Dates', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This Weekend', value: 'weekend' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Custom Range', value: 'custom' },
]

function selectPreset(value: string) {
  if (value === 'custom') {
    showCustomCalendar.value = true
  } else {
    showCustomCalendar.value = false
    emit('update:modelValue', value)
    emit('update:customRange', undefined)
  }
}

function handleCustomRangeSelect(range: DateRange | null) {
  emit('update:customRange', range ?? undefined)
  if (range?.start && range?.end) {
    emit('update:modelValue', 'custom')
    showCustomCalendar.value = false
  }
}

const customRangeLabel = computed(() => {
  if (!props.customRange?.start || !props.customRange?.end) return null

  const start = props.customRange.start
  const end = props.customRange.end
  const startDate = new Date(start.year, start.month - 1, start.day)
  const endDate = new Date(end.year, end.month - 1, end.day)

  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      <button
        v-for="preset in datePresets"
        :key="preset.value"
        type="button"
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
        :class="[
          modelValue === preset.value
            ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-500'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        ]"
        @click="selectPreset(preset.value)"
      >
        {{ preset.value === 'custom' && customRangeLabel ? customRangeLabel : preset.label }}
      </button>
    </div>

    <!-- Custom Date Range Picker -->
    <div
      v-if="showCustomCalendar"
      class="mt-3 p-3 bg-gray-50 rounded-lg"
    >
      <UCalendar
        range
        :model-value="customRange"
        :min-value="today(getLocalTimeZone())"
        class="rounded-lg border bg-white"
        @update:model-value="handleCustomRangeSelect"
      />
    </div>
  </div>
</template>
