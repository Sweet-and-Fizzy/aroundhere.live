<script setup lang="ts">
type FavoriteType = 'artist' | 'venue' | 'genre'

const props = defineProps<{
  type: FavoriteType
  id: string
  name: string
  slug?: string
  size?: 'sm' | 'md' | 'lg'
}>()

const { loggedIn } = useUserSession()
const {
  isArtistFavorited,
  isVenueFavorited,
  isGenreFavorited,
  toggleArtist,
  toggleVenue,
  toggleGenre,
} = useFavorites()

const toggling = ref(false)

const isFavorited = computed(() => {
  switch (props.type) {
    case 'artist':
      return isArtistFavorited(props.id)
    case 'venue':
      return isVenueFavorited(props.id)
    case 'genre':
      return isGenreFavorited(props.id)
    default:
      return false
  }
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

async function handleClick() {
  if (!loggedIn.value) {
    // Could navigate to login or show a modal
    return
  }

  toggling.value = true

  try {
    switch (props.type) {
      case 'artist':
        await toggleArtist({
          id: props.id,
          name: props.name,
          slug: props.slug || props.id,
        })
        break
      case 'venue':
        await toggleVenue({
          id: props.id,
          name: props.name,
          slug: props.slug || props.id,
        })
        break
      case 'genre':
        await toggleGenre(props.id)
        break
    }
  } finally {
    toggling.value = false
  }
}

const tooltipText = computed(() => {
  if (!loggedIn.value) {
    return 'Sign in to favorite and get notified about shows'
  }
  if (isFavorited.value) {
    return `Remove ${props.name} from favorites`
  }
  return `Add ${props.name} to favorites`
})
</script>

<template>
  <UTooltip :text="tooltipText">
    <button
      type="button"
      :class="[
        'rounded-full transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center justify-center',
        buttonSizeClasses,
        isFavorited
          ? 'text-red-500 hover:text-red-600'
          : 'text-gray-400 hover:text-red-400',
        !loggedIn && 'opacity-75',
      ]"
      :disabled="toggling"
      @click.prevent.stop="handleClick"
    >
      <UIcon
        :name="isFavorited ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
        :class="[sizeClasses, toggling && 'animate-pulse']"
      />
    </button>
  </UTooltip>
</template>
