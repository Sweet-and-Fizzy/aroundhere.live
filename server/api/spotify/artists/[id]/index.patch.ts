/**
 * Manually update an artist's Spotify match
 * PATCH /api/spotify/artists/:id
 *
 * Body:
 *   { spotifyId: string } - Set specific Spotify artist ID (marks as VERIFIED)
 *   { status: 'NO_MATCH' } - Mark as no Spotify presence
 *   { status: 'PENDING' } - Reset to pending for re-matching
 */

import {
  manuallyMatchArtist,
  markArtistNoMatch,
  resetArtistMatch,
} from '../../../../services/spotify/artist-matcher'

export default defineEventHandler(async (event) => {
  const artistId = getRouterParam(event, 'id')
  if (!artistId) {
    throw createError({
      statusCode: 400,
      message: 'Artist ID is required',
    })
  }

  const body = await readBody(event)

  // Manual match with specific Spotify ID
  if (body.spotifyId) {
    const result = await manuallyMatchArtist(artistId, body.spotifyId)
    return result
  }

  // Status updates
  if (body.status === 'NO_MATCH') {
    await markArtistNoMatch(artistId)
    return { success: true, status: 'NO_MATCH' }
  }

  if (body.status === 'PENDING') {
    await resetArtistMatch(artistId)
    return { success: true, status: 'PENDING' }
  }

  throw createError({
    statusCode: 400,
    message: 'Must provide spotifyId or status (NO_MATCH, PENDING)',
  })
})
