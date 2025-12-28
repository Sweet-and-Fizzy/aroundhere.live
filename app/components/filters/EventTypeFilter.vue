<script setup lang="ts">
const props = defineProps<{
  modelValue: string[]
  facets?: {
    typeCounts: Record<string, number>
    musicCount: number
    nonMusicCount: number
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const { getEventTypeLabel, getEventTypeBadgeClasses } = useEventTypeLabels()

// Event type hierarchy
const eventTypeHierarchy = {
  ALL_MUSIC: ['MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE'],
  ALL_EVENTS: ['COMEDY', 'THEATER', 'TRIVIA', 'GAMES', 'PRIVATE', 'FILM', 'SPOKEN_WORD', 'DANCE', 'MARKET', 'WORKSHOP', 'PARTY', 'SPORTS', 'COMMUNITY', 'FOOD', 'OTHER'],
}

const allEventTypes = [
  'ALL_MUSIC',
  'ALL_EVENTS',
  ...eventTypeHierarchy.ALL_MUSIC,
  ...eventTypeHierarchy.ALL_EVENTS,
]

function isSelected(type: string): boolean {
  return props.modelValue.includes(type)
}

function toggleEventType(type: string) {
  const current = [...props.modelValue]

  if (type === 'ALL_MUSIC' || type === 'ALL_EVENTS') {
    // Meta-type toggle
    if (current.includes(type)) {
      // Remove meta-type and all its children
      const children = eventTypeHierarchy[type] || []
      emit('update:modelValue', current.filter(t => t !== type && !children.includes(t)))
    } else {
      // Add meta-type, remove conflicting types
      const otherMeta = type === 'ALL_MUSIC' ? 'ALL_EVENTS' : 'ALL_MUSIC'
      const otherChildren = eventTypeHierarchy[otherMeta] || []
      const filtered = current.filter(t => t !== otherMeta && !otherChildren.includes(t))
      emit('update:modelValue', [...filtered, type])
    }
  } else {
    // Individual type toggle
    if (current.includes(type)) {
      // Remove individual type, and any parent meta-types
      const parentMeta = eventTypeHierarchy.ALL_MUSIC.includes(type) ? 'ALL_MUSIC' : 'ALL_EVENTS'
      emit('update:modelValue', current.filter(t => t !== type && t !== parentMeta))
    } else {
      // Add individual type, remove parent meta-types
      const parentMeta = eventTypeHierarchy.ALL_MUSIC.includes(type) ? 'ALL_MUSIC' : 'ALL_EVENTS'
      const filtered = current.filter(t => t !== parentMeta)
      emit('update:modelValue', [...filtered, type])
    }
  }
}

function getCount(type: string): number {
  if (!props.facets) return 0

  if (type === 'ALL_MUSIC') {
    return props.facets.musicCount || 0
  }
  if (type === 'ALL_EVENTS') {
    return props.facets.nonMusicCount || 0
  }
  return props.facets.typeCounts[type] || 0
}

// Only show types that have events
const visibleTypes = computed(() => {
  return allEventTypes.filter(type => getCount(type) > 0 || isSelected(type))
})

// Group types for display
const musicTypes = computed(() =>
  visibleTypes.value.filter(t => t === 'ALL_MUSIC' || eventTypeHierarchy.ALL_MUSIC.includes(t))
)

const otherTypes = computed(() =>
  visibleTypes.value.filter(t => t === 'ALL_EVENTS' || eventTypeHierarchy.ALL_EVENTS.includes(t))
)
</script>

<template>
  <div class="space-y-3">
    <!-- Music Types -->
    <div
      v-if="musicTypes.length > 0"
      class="space-y-1"
    >
      <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        Music Events
      </div>
      <label
        v-for="type in musicTypes"
        :key="type"
        class="flex items-center gap-2 cursor-pointer py-1"
      >
        <input
          type="checkbox"
          :checked="isSelected(type)"
          class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          @change="toggleEventType(type)"
        >
        <span
          class="text-sm flex-1"
          :class="type === 'ALL_MUSIC' ? 'font-medium' : 'pl-4'"
        >
          {{ getEventTypeLabel(type) }}
        </span>
        <span class="text-xs text-gray-400">
          {{ getCount(type) }}
        </span>
      </label>
    </div>

    <!-- Other Event Types -->
    <div
      v-if="otherTypes.length > 0"
      class="space-y-1"
    >
      <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        Other Events
      </div>
      <label
        v-for="type in otherTypes"
        :key="type"
        class="flex items-center gap-2 cursor-pointer py-1"
      >
        <input
          type="checkbox"
          :checked="isSelected(type)"
          class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          @change="toggleEventType(type)"
        >
        <span
          class="text-sm flex-1"
          :class="type === 'ALL_EVENTS' ? 'font-medium' : 'pl-4'"
        >
          {{ getEventTypeLabel(type) }}
        </span>
        <span class="text-xs text-gray-400">
          {{ getCount(type) }}
        </span>
      </label>
    </div>
  </div>
</template>
