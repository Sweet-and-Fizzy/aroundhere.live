<script setup lang="ts">
interface Artist {
  id: string
  name: string
  slug: string
  genres?: string[]
  spotifyId?: string | null
}

interface EventArtist {
  artist: Artist
  order: number
}

const props = defineProps<{
  eventArtists: EventArtist[]
  size?: 'sm' | 'md' | 'lg'
}>()

const { loggedIn } = useUserSession()
const { isArtistFavorited, toggleArtist } = useFavorites()

const isOpen = ref(false)

// Sort by order (headliner first)
const sortedArtists = computed(() => {
  return [...props.eventArtists].sort((a, b) => a.order - b.order)
})

// Check if any artist is favorited
const hasAnyFavorite = computed(() => {
  return props.eventArtists.some(ea => isArtistFavorited(ea.artist.id))
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'w-4 h-4'
    case 'lg':
      return 'w-6 h-6'
    default:
      return 'w-5 h-5'
  }
})

const buttonSizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'p-1'
    case 'lg':
      return 'p-2'
    default:
      return 'p-1.5'
  }
})

async function handleToggle(artist: Artist) {
  await toggleArtist(artist)
}

const tooltipText = computed(() => {
  if (!loggedIn.value) {
    return 'Sign in to favorite artists'
  }
  return 'Favorite artists'
})
</script>

<template>
  <UTooltip :text="tooltipText">
    <UPopover
      v-model:open="isOpen"
      :popper="{ placement: 'bottom-end' }"
    >
      <button
        type="button"
        :class="[
          'rounded-full transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center justify-center',
          buttonSizeClasses,
          hasAnyFavorite
            ? 'text-red-500 hover:text-red-600'
            : 'text-gray-400 hover:text-red-400',
          !loggedIn && 'opacity-75',
        ]"
      >
        <UIcon
          :name="hasAnyFavorite ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
          :class="sizeClasses"
        />
      </button>

      <template #content>
        <div class="p-2 min-w-[200px]">
          <template v-if="loggedIn">
            <div
              v-for="ea in sortedArtists"
              :key="ea.artist.id"
              class="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <span class="text-sm truncate">{{ ea.artist.name }}</span>
              <button
                type="button"
                class="flex-shrink-0 p-1 rounded-full transition-colors"
                :class="[
                  isArtistFavorited(ea.artist.id)
                    ? 'text-red-500 hover:text-red-600'
                    : 'text-gray-400 hover:text-red-400',
                ]"
                @click.prevent.stop="handleToggle(ea.artist)"
              >
                <UIcon
                  :name="isArtistFavorited(ea.artist.id) ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
                  class="w-4 h-4"
                />
              </button>
            </div>
          </template>

          <template v-else>
            <div class="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">
              <NuxtLink
                to="/login"
                class="text-primary-500 hover:text-primary-600 font-medium"
                @click="isOpen = false"
              >
                Sign in
              </NuxtLink>
              to favorite artists and get notified about their shows.
            </div>
          </template>
        </div>
      </template>
    </UPopover>
  </UTooltip>
</template>
