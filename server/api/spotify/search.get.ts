/**
 * Search Spotify for artists
 * GET /api/spotify/search?q=artist+name
 *
 * Used for manual artist matching in admin UI
 */

import { spotifyService } from '../../services/spotify'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = query.q as string

  if (!q || q.trim().length < 2) {
    throw createError({
      statusCode: 400,
      message: 'Search query must be at least 2 characters',
    })
  }

  if (!spotifyService.isConfigured()) {
    throw createError({
      statusCode: 500,
      message: 'Spotify API not configured',
    })
  }

  const limit = Math.min(Number(query.limit) || 10, 20)
  const artists = await spotifyService.searchArtist(q.trim(), limit)

  return {
    query: q,
    artists: artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      popularity: artist.popularity,
      genres: artist.genres,
      imageUrl: artist.images?.[0]?.url || null,
      spotifyUrl: artist.external_urls.spotify,
    })),
  }
})
