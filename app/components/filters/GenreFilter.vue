<script setup lang="ts">
const props = defineProps<{
  modelValue: string[]
  genres?: string[]
  genreLabels?: Record<string, string>
  facets?: {
    genreCounts: Record<string, number>
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const { getGenreLabel } = useGenreLabels()

function isSelected(genre: string): boolean {
  return props.modelValue.includes(genre)
}

function toggleGenre(genre: string) {
  if (isSelected(genre)) {
    emit('update:modelValue', props.modelValue.filter(g => g !== genre))
  } else {
    emit('update:modelValue', [...props.modelValue, genre])
  }
}

function getCount(genre: string): number {
  return props.facets?.genreCounts[genre] || 0
}

// Sort genres by count, then alphabetically
const sortedGenres = computed(() => {
  const genres = props.genres || Object.keys(props.facets?.genreCounts || {})
  return genres
    .filter(g => getCount(g) > 0 || isSelected(g))
    .sort((a, b) => {
      // Selected first
      const aSelected = isSelected(a) ? 1 : 0
      const bSelected = isSelected(b) ? 1 : 0
      if (aSelected !== bSelected) return bSelected - aSelected

      // Then by count
      const countDiff = getCount(b) - getCount(a)
      if (countDiff !== 0) return countDiff

      // Then alphabetically
      const labelA = getGenreLabel(a)
      const labelB = getGenreLabel(b)
      return labelA.localeCompare(labelB)
    })
})
</script>

<template>
  <div class="space-y-1 max-h-64 overflow-y-auto">
    <label
      v-for="genre in sortedGenres"
      :key="genre"
      class="flex items-center gap-2 cursor-pointer py-1 hover:bg-gray-50 rounded px-1"
    >
      <input
        type="checkbox"
        :checked="isSelected(genre)"
        class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        @change="toggleGenre(genre)"
      >
      <span class="text-sm flex-1 truncate">
        {{ getGenreLabel(genre) }}
      </span>
      <span class="text-xs text-gray-400 flex-shrink-0">
        {{ getCount(genre) }}
      </span>
    </label>

    <p
      v-if="sortedGenres.length === 0"
      class="text-sm text-gray-500 italic py-2"
    >
      No genres available
    </p>
  </div>
</template>
