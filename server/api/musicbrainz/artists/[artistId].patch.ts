/**
 * Update an artist's MusicBrainz match
 * PATCH /api/musicbrainz/artists/:artistId
 *
 * Body:
 * - musicbrainzId: string - Set a specific MusicBrainz ID (manual match)
 * - status: 'NO_MATCH' | 'PENDING' - Mark as no match or reset to pending
 */

import { manuallyMatchArtist, markArtistNoMatch, resetArtistMatch } from '../../../services/musicbrainz/artist-matcher'

export default defineEventHandler(async (event) => {
  const artistId = getRouterParam(event, 'artistId')

  if (!artistId) {
    throw createError({
      statusCode: 400,
      message: 'Artist ID is required',
    })
  }

  const body = await readBody(event)

  // Manual match with a specific MusicBrainz ID
  if (body.musicbrainzId) {
    const result = await manuallyMatchArtist(artistId, body.musicbrainzId)
    return {
      success: true,
      status: result.status,
      musicbrainzId: result.musicbrainzId,
      tagsCount: result.tagsCount,
    }
  }

  // Mark as no match
  if (body.status === 'NO_MATCH') {
    await markArtistNoMatch(artistId)
    return {
      success: true,
      status: 'NO_MATCH',
    }
  }

  // Reset to pending
  if (body.status === 'PENDING') {
    await resetArtistMatch(artistId)
    return {
      success: true,
      status: 'PENDING',
    }
  }

  throw createError({
    statusCode: 400,
    message: 'Invalid request. Provide musicbrainzId or status.',
  })
})
