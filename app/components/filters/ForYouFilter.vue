<script setup lang="ts">
const props = defineProps<{
  // Recommended filter
  recommended: boolean
  // Favorites filters
  filterByArtists: boolean
  filterByVenues: boolean
  filterByGenres: boolean
  artistCount?: number
  venueCount?: number
  genreCount?: number
}>()

const emit = defineEmits<{
  'update:recommended': [value: boolean]
  'update:filterByArtists': [value: boolean]
  'update:filterByVenues': [value: boolean]
  'update:filterByGenres': [value: boolean]
}>()

const hasAnyFavorites = computed(() => {
  return (props.artistCount || 0) > 0 ||
         (props.venueCount || 0) > 0 ||
         (props.genreCount || 0) > 0
})
</script>

<template>
  <div class="space-y-3">
    <!-- Recommended option -->
    <button
      type="button"
      class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="[
        recommended
          ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-500'
          : 'bg-gray-50 text-gray-700 hover:bg-gray-100',
      ]"
      @click="emit('update:recommended', !recommended)"
    >
      <UIcon
        name="i-heroicons-sparkles"
        class="w-4 h-4"
      />
      Recommended For You
    </button>

    <!-- Favorites section -->
    <div
      v-if="hasAnyFavorites"
      class="space-y-2 pt-2 border-t border-gray-200"
    >
      <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">
        Match Favorites
      </p>

      <label
        v-if="artistCount && artistCount > 0"
        class="flex items-center gap-2 cursor-pointer py-1"
      >
        <input
          type="checkbox"
          :checked="filterByArtists"
          class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          @change="emit('update:filterByArtists', !filterByArtists)"
        >
        <UIcon
          name="i-heroicons-musical-note"
          class="w-4 h-4 text-gray-500"
        />
        <span class="text-sm flex-1">
          Favorite Artists
        </span>
        <span class="text-xs text-gray-400">
          {{ artistCount }}
        </span>
      </label>

      <label
        v-if="venueCount && venueCount > 0"
        class="flex items-center gap-2 cursor-pointer py-1"
      >
        <input
          type="checkbox"
          :checked="filterByVenues"
          class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          @change="emit('update:filterByVenues', !filterByVenues)"
        >
        <UIcon
          name="i-heroicons-map-pin"
          class="w-4 h-4 text-gray-500"
        />
        <span class="text-sm flex-1">
          Favorite Venues
        </span>
        <span class="text-xs text-gray-400">
          {{ venueCount }}
        </span>
      </label>

      <label
        v-if="genreCount && genreCount > 0"
        class="flex items-center gap-2 cursor-pointer py-1"
      >
        <input
          type="checkbox"
          :checked="filterByGenres"
          class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          @change="emit('update:filterByGenres', !filterByGenres)"
        >
        <UIcon
          name="i-heroicons-tag"
          class="w-4 h-4 text-gray-500"
        />
        <span class="text-sm flex-1">
          Favorite Genres
        </span>
        <span class="text-xs text-gray-400">
          {{ genreCount }}
        </span>
      </label>
    </div>

    <p
      v-else
      class="text-xs text-gray-500 pt-2 border-t border-gray-200"
    >
      Add favorites from event and artist pages for more matching options.
    </p>
  </div>
</template>
