/**
 * Search MusicBrainz for artists
 * GET /api/musicbrainz/search?q=artist+name&limit=10
 */

import { musicBrainzService } from '../../services/musicbrainz'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = (query.q as string || '').trim()
  const limit = Math.min(25, Math.max(1, parseInt(query.limit as string) || 10))

  if (!q) {
    throw createError({
      statusCode: 400,
      message: 'Search query is required',
    })
  }

  try {
    const results = await musicBrainzService.searchArtist(q, limit)

    return {
      artists: results.map(artist => ({
        id: artist.id,
        name: artist.name,
        disambiguation: artist.disambiguation || null,
        country: artist.country || null,
        type: artist.type || null,
        score: artist.score,
        tags: artist.tags?.slice(0, 5).map(t => t.name) || [],
      })),
    }
  } catch (error) {
    console.error('MusicBrainz search failed:', error)
    throw createError({
      statusCode: 500,
      message: 'MusicBrainz search failed',
    })
  }
})
