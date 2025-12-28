<script setup lang="ts">
const props = defineProps<{
  modelValue: string[]
  facets?: {
    typeCounts: Record<string, number>
    musicCount: number
    nonMusicCount: number
    totalCount?: number
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const { getEventTypeLabel } = useEventTypeLabels()

// Event type hierarchy - three tiers
const eventTypeHierarchy = {
  ALL_MUSIC: ['MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE'],
  OTHER_EVENTS: ['COMEDY', 'THEATER', 'TRIVIA', 'GAMES', 'PRIVATE', 'FILM', 'SPOKEN_WORD', 'DANCE', 'MARKET', 'WORKSHOP', 'PARTY', 'SPORTS', 'COMMUNITY', 'FOOD', 'DRAG', 'FITNESS', 'OTHER'],
}

const allEventTypes = [
  'ALL_EVENTS',
  'ALL_MUSIC',
  'OTHER_EVENTS',
  ...eventTypeHierarchy.ALL_MUSIC,
  ...eventTypeHierarchy.OTHER_EVENTS,
]

function isSelected(type: string): boolean {
  return props.modelValue.includes(type)
}

function getParentMeta(type: string): 'ALL_MUSIC' | 'OTHER_EVENTS' | null {
  if (eventTypeHierarchy.ALL_MUSIC.includes(type)) return 'ALL_MUSIC'
  if (eventTypeHierarchy.OTHER_EVENTS.includes(type)) return 'OTHER_EVENTS'
  return null
}

function toggleEventType(type: string) {
  const current = [...props.modelValue]

  if (type === 'ALL_EVENTS') {
    // Top-level: clear all filters (show everything)
    emit('update:modelValue', [])
  } else if (type === 'ALL_MUSIC' || type === 'OTHER_EVENTS') {
    // Category meta-type toggle
    if (current.includes(type)) {
      // Remove meta-type and all its children
      const children = eventTypeHierarchy[type] || []
      emit('update:modelValue', current.filter(t => t !== type && !children.includes(t)))
    } else {
      // Add meta-type, remove its children (meta implies all children), keep other category selections
      const children = eventTypeHierarchy[type] || []
      const filtered = current.filter(t => !children.includes(t))
      emit('update:modelValue', [...filtered, type])
    }
  } else {
    // Individual type toggle
    const parentMeta = getParentMeta(type)
    if (current.includes(type)) {
      // Remove individual type and parent meta-type if present
      emit('update:modelValue', current.filter(t => t !== type && t !== parentMeta))
    } else {
      // Add individual type, remove parent meta-type (switching from "all" to specific)
      const filtered = current.filter(t => t !== parentMeta)
      emit('update:modelValue', [...filtered, type])
    }
  }
}

function getCount(type: string): number {
  if (!props.facets) return 0

  if (type === 'ALL_EVENTS') {
    return props.facets.totalCount || (props.facets.musicCount + props.facets.nonMusicCount) || 0
  }
  if (type === 'ALL_MUSIC') {
    return props.facets.musicCount || 0
  }
  if (type === 'OTHER_EVENTS') {
    return props.facets.nonMusicCount || 0
  }
  return props.facets.typeCounts[type] || 0
}

// Only show types that have events (except ALL_EVENTS which always shows)
const visibleTypes = computed(() => {
  return allEventTypes.filter(type => type === 'ALL_EVENTS' || getCount(type) > 0 || isSelected(type))
})

// Check if "All Events" is effectively selected (no filters applied)
const isAllEventsSelected = computed(() => props.modelValue.length === 0)

// Group types for display
const musicTypes = computed(() =>
  visibleTypes.value.filter(t => t === 'ALL_MUSIC' || eventTypeHierarchy.ALL_MUSIC.includes(t))
)

const otherTypes = computed(() =>
  visibleTypes.value.filter(t => t === 'OTHER_EVENTS' || eventTypeHierarchy.OTHER_EVENTS.includes(t))
)
</script>

<template>
  <div class="space-y-3">
    <!-- All Events (top-level) -->
    <label class="flex items-center gap-2 cursor-pointer py-1">
      <input
        type="checkbox"
        :checked="isAllEventsSelected"
        class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        @change="toggleEventType('ALL_EVENTS')"
      >
      <span class="text-sm flex-1 font-medium">
        All Events
      </span>
      <span class="text-xs text-gray-400">
        {{ getCount('ALL_EVENTS') }}
      </span>
    </label>

    <!-- Music Types -->
    <div
      v-if="musicTypes.length > 0"
      class="space-y-1"
    >
      <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        Music
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
          :class="type === 'OTHER_EVENTS' ? 'font-medium' : 'pl-4'"
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
