interface FavoriteArtist {
  id: string
  name: string
  slug: string
  genres?: string[]
  spotifyId?: string | null
}

interface FavoriteVenue {
  id: string
  name: string
  slug: string
  city?: string
  state?: string
}

interface Favorites {
  artists: FavoriteArtist[]
  venues: FavoriteVenue[]
  genres: string[]
  eventTypes: string[]
}

interface FavoriteIds {
  artistIds: string[]
  venueIds: string[]
  genres: string[]
  eventTypes: string[]
}

export function useFavorites() {
  const { loggedIn } = useUserSession()
  
  // Persisted state across navigations
  const favorites = useState<Favorites>('user-favorites', () => ({
    artists: [],
    venues: [],
    genres: [],
    eventTypes: [],
  }))
  
  // Set of IDs for quick lookups
  const favoriteIds = computed<FavoriteIds>(() => ({
    artistIds: favorites.value.artists.map(a => a.id),
    venueIds: favorites.value.venues.map(v => v.id),
    genres: favorites.value.genres,
    eventTypes: favorites.value.eventTypes,
  }))
  
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Fetch all favorites
  async function fetchFavorites() {
    if (!loggedIn.value) {
      favorites.value = { artists: [], venues: [], genres: [], eventTypes: [] }
      return
    }

    loading.value = true
    error.value = null

    try {
      const data = await $fetch<Favorites>('/api/favorites')
      favorites.value = data
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch favorites'
      console.error('Error fetching favorites:', e)
    } finally {
      loading.value = false
    }
  }

  // Check if items are favorited
  function isArtistFavorited(artistId: string): boolean {
    return favoriteIds.value.artistIds.includes(artistId)
  }

  function isVenueFavorited(venueId: string): boolean {
    return favoriteIds.value.venueIds.includes(venueId)
  }

  function isGenreFavorited(genre: string): boolean {
    return favoriteIds.value.genres.includes(genre)
  }

  function isEventTypeFavorited(eventType: string): boolean {
    return favoriteIds.value.eventTypes.includes(eventType)
  }

  // Toggle favorites
  async function toggleArtist(artist: { id: string; name: string; slug: string }) {
    if (!loggedIn.value) return false

    const isFavorited = isArtistFavorited(artist.id)

    try {
      if (isFavorited) {
        await $fetch(`/api/favorites/artists/${artist.id}`, { method: 'DELETE' })
        favorites.value.artists = favorites.value.artists.filter(a => a.id !== artist.id)
      } else {
        await $fetch('/api/favorites/artists', {
          method: 'POST',
          body: { artistId: artist.id },
        })
        favorites.value.artists = [...favorites.value.artists, artist]
      }
      return true
    } catch (e) {
      console.error('Error toggling artist favorite:', e)
      return false
    }
  }

  async function toggleVenue(venue: { id: string; name: string; slug: string }) {
    if (!loggedIn.value) return false

    const isFavorited = isVenueFavorited(venue.id)

    try {
      if (isFavorited) {
        await $fetch(`/api/favorites/venues/${venue.id}`, { method: 'DELETE' })
        favorites.value.venues = favorites.value.venues.filter(v => v.id !== venue.id)
      } else {
        await $fetch('/api/favorites/venues', {
          method: 'POST',
          body: { venueId: venue.id },
        })
        favorites.value.venues = [...favorites.value.venues, venue]
      }
      return true
    } catch (e) {
      console.error('Error toggling venue favorite:', e)
      return false
    }
  }

  async function toggleGenre(genre: string) {
    if (!loggedIn.value) return false

    const isFavorited = isGenreFavorited(genre)

    try {
      if (isFavorited) {
        await $fetch(`/api/favorites/genres/${genre}`, { method: 'DELETE' })
        favorites.value.genres = favorites.value.genres.filter(g => g !== genre)
      } else {
        await $fetch('/api/favorites/genres', {
          method: 'POST',
          body: { genre },
        })
        favorites.value.genres = [...favorites.value.genres, genre]
      }
      return true
    } catch (e) {
      console.error('Error toggling genre favorite:', e)
      return false
    }
  }

  async function toggleEventType(eventType: string) {
    if (!loggedIn.value) return false

    const isFavorited = isEventTypeFavorited(eventType)

    try {
      if (isFavorited) {
        await $fetch(`/api/favorites/event-types/${eventType}`, { method: 'DELETE' })
        favorites.value.eventTypes = favorites.value.eventTypes.filter(t => t !== eventType)
      } else {
        await $fetch('/api/favorites/event-types', {
          method: 'POST',
          body: { eventType },
        })
        favorites.value.eventTypes = [...favorites.value.eventTypes, eventType]
      }
      return true
    } catch (e) {
      console.error('Error toggling event type favorite:', e)
      return false
    }
  }

  // Batch check favorites (useful when loading a list of events)
  async function checkFavorites(artistIds: string[], venueIds: string[], genres: string[]): Promise<FavoriteIds> {
    if (!loggedIn.value) {
      return { artistIds: [], venueIds: [], genres: [], eventTypes: [] }
    }

    try {
      const params = new URLSearchParams()
      if (artistIds.length) params.set('artistIds', artistIds.join(','))
      if (venueIds.length) params.set('venueIds', venueIds.join(','))
      if (genres.length) params.set('genres', genres.join(','))

      return await $fetch<FavoriteIds>(`/api/favorites/check?${params}`)
    } catch (e) {
      console.error('Error checking favorites:', e)
      return { artistIds: [], venueIds: [], genres: [], eventTypes: [] }
    }
  }

  // Fetch on mount if logged in
  if (import.meta.client && loggedIn.value) {
    fetchFavorites()
  }

  // Watch for login changes
  watch(loggedIn, (isLoggedIn) => {
    if (isLoggedIn) {
      fetchFavorites()
    } else {
      favorites.value = { artists: [], venues: [], genres: [], eventTypes: [] }
    }
  })

  return {
    favorites,
    favoriteIds,
    loading,
    error,
    fetchFavorites,
    isArtistFavorited,
    isVenueFavorited,
    isGenreFavorited,
    isEventTypeFavorited,
    toggleArtist,
    toggleVenue,
    toggleGenre,
    toggleEventType,
    checkFavorites,
  }
}
