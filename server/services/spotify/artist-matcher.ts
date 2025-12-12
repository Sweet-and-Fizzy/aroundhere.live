/**
 * Artist Matcher Service
 *
 * Processes artists with PENDING Spotify status:
 * - Searches Spotify for matches
 * - Calculates confidence scores
 * - Updates status to AUTO_MATCHED, NEEDS_REVIEW, or NO_MATCH
 * - Fetches popular tracks for matched artists
 */

import { prisma } from '../../utils/prisma'
import { spotifyService } from './index'
import type { SpotifyMatchStatus } from '@prisma/client'

// Confidence thresholds
const AUTO_MATCH_THRESHOLD = 0.9  // >= 0.9 = auto-matched
const REVIEW_THRESHOLD = 0.5      // 0.5-0.9 = needs review, < 0.5 = no match

// Rate limiting
const DELAY_BETWEEN_ARTISTS_MS = 500  // Avoid hitting Spotify rate limits

export interface MatchResult {
  artistId: string
  artistName: string
  status: SpotifyMatchStatus
  spotifyId?: string
  spotifyName?: string
  confidence?: number
  error?: string
}

export interface MatchJobResult {
  processed: number
  autoMatched: number
  needsReview: number
  noMatch: number
  errors: number
  results: MatchResult[]
}

/**
 * Process a batch of pending artists
 */
export async function matchPendingArtists(
  limit = 50
): Promise<MatchJobResult> {
  if (!spotifyService.isConfigured()) {
    throw new Error('Spotify API not configured')
  }

  // Get pending artists
  const pendingArtists = await prisma.artist.findMany({
    where: {
      spotifyMatchStatus: 'PENDING',
    },
    take: limit,
    orderBy: {
      createdAt: 'asc',  // Process oldest first
    },
  })

  const result: MatchJobResult = {
    processed: 0,
    autoMatched: 0,
    needsReview: 0,
    noMatch: 0,
    errors: 0,
    results: [],
  }

  for (const artist of pendingArtists) {
    const matchResult = await matchSingleArtist(artist.id, artist.name)
    result.results.push(matchResult)
    result.processed++

    switch (matchResult.status) {
      case 'AUTO_MATCHED':
        result.autoMatched++
        break
      case 'NEEDS_REVIEW':
        result.needsReview++
        break
      case 'NO_MATCH':
        result.noMatch++
        break
    }

    if (matchResult.error) {
      result.errors++
    }

    // Rate limit
    if (result.processed < pendingArtists.length) {
      await sleep(DELAY_BETWEEN_ARTISTS_MS)
    }
  }

  return result
}

/**
 * Match a single artist by ID
 */
export async function matchSingleArtist(
  artistId: string,
  artistName: string
): Promise<MatchResult> {
  try {
    const match = await spotifyService.matchArtist(artistName)

    if (!match) {
      // No match found
      await prisma.artist.update({
        where: { id: artistId },
        data: {
          spotifyMatchStatus: 'NO_MATCH',
          spotifyMatchConfidence: 0,
        },
      })

      return {
        artistId,
        artistName,
        status: 'NO_MATCH',
      }
    }

    // Determine status based on confidence
    let status: SpotifyMatchStatus
    if (match.confidence >= AUTO_MATCH_THRESHOLD) {
      status = 'AUTO_MATCHED'
    } else if (match.confidence >= REVIEW_THRESHOLD) {
      status = 'NEEDS_REVIEW'
    } else {
      status = 'NO_MATCH'
    }

    // For auto-matched or needs-review, fetch popular tracks
    let popularTracks = null
    if (status === 'AUTO_MATCHED' || status === 'NEEDS_REVIEW') {
      try {
        popularTracks = await spotifyService.getPopularTracks(match.artist.id, 4)
      } catch (err) {
        console.warn(`Failed to get tracks for ${artistName}:`, err)
      }
    }

    // Update artist record
    await prisma.artist.update({
      where: { id: artistId },
      data: {
        spotifyId: match.artist.id,
        spotifyName: match.artist.name,
        spotifyMatchConfidence: match.confidence,
        spotifyMatchStatus: status,
        spotifyPopularTracks: popularTracks ?? undefined,
        spotifyTracksUpdatedAt: popularTracks ? new Date() : null,
      },
    })

    return {
      artistId,
      artistName,
      status,
      spotifyId: match.artist.id,
      spotifyName: match.artist.name,
      confidence: match.confidence,
    }
  } catch (err) {
    console.error(`Error matching artist ${artistName}:`, err)

    return {
      artistId,
      artistName,
      status: 'PENDING',  // Keep pending on error to retry later
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Manually set an artist's Spotify match
 */
export async function manuallyMatchArtist(
  artistId: string,
  spotifyId: string
): Promise<MatchResult> {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
  })

  if (!artist) {
    throw new Error('Artist not found')
  }

  try {
    // Fetch artist info from Spotify to get the name
    const searchResults = await spotifyService.searchArtist(spotifyId, 1)

    // If search by ID didn't work, try fetching top tracks to validate the ID
    let spotifyName = spotifyId
    let popularTracks = null

    try {
      popularTracks = await spotifyService.getPopularTracks(spotifyId, 4)
      // If we got tracks, the ID is valid
      // Try to get artist name from track data
      if (popularTracks.length > 0) {
        // We'll use the ID as name for now - could enhance later
      }
    } catch {
      throw new Error(`Invalid Spotify artist ID: ${spotifyId}`)
    }

    // For manual matches where we have search results, use the name
    if (searchResults.length > 0 && searchResults[0].id === spotifyId) {
      spotifyName = searchResults[0].name
    }

    await prisma.artist.update({
      where: { id: artistId },
      data: {
        spotifyId,
        spotifyName,
        spotifyMatchConfidence: 1.0,  // Manual = 100% confidence
        spotifyMatchStatus: 'VERIFIED',
        spotifyPopularTracks: popularTracks ?? undefined,
        spotifyTracksUpdatedAt: popularTracks ? new Date() : null,
      },
    })

    return {
      artistId,
      artistName: artist.name,
      status: 'VERIFIED',
      spotifyId,
      spotifyName,
      confidence: 1.0,
    }
  } catch (err) {
    throw new Error(
      `Failed to match artist: ${err instanceof Error ? err.message : 'Unknown error'}`
    )
  }
}

/**
 * Mark an artist as having no Spotify presence
 */
export async function markArtistNoMatch(artistId: string): Promise<void> {
  await prisma.artist.update({
    where: { id: artistId },
    data: {
      spotifyId: null,
      spotifyName: null,
      spotifyMatchConfidence: null,
      spotifyMatchStatus: 'NO_MATCH',
      spotifyPopularTracks: undefined,
      spotifyTracksUpdatedAt: null,
    },
  })
}

/**
 * Reset an artist to pending status (for re-matching)
 */
export async function resetArtistMatch(artistId: string): Promise<void> {
  await prisma.artist.update({
    where: { id: artistId },
    data: {
      spotifyId: null,
      spotifyName: null,
      spotifyMatchConfidence: null,
      spotifyMatchStatus: 'PENDING',
      spotifyPopularTracks: undefined,
      spotifyTracksUpdatedAt: null,
    },
  })
}

/**
 * Get statistics on artist matching status
 */
export async function getMatchingStats(): Promise<{
  pending: number
  autoMatched: number
  needsReview: number
  verified: number
  noMatch: number
  total: number
}> {
  const [pending, autoMatched, needsReview, verified, noMatch] =
    await Promise.all([
      prisma.artist.count({ where: { spotifyMatchStatus: 'PENDING' } }),
      prisma.artist.count({ where: { spotifyMatchStatus: 'AUTO_MATCHED' } }),
      prisma.artist.count({ where: { spotifyMatchStatus: 'NEEDS_REVIEW' } }),
      prisma.artist.count({ where: { spotifyMatchStatus: 'VERIFIED' } }),
      prisma.artist.count({ where: { spotifyMatchStatus: 'NO_MATCH' } }),
    ])

  return {
    pending,
    autoMatched,
    needsReview,
    verified,
    noMatch,
    total: pending + autoMatched + needsReview + verified + noMatch,
  }
}

/**
 * Refresh popular tracks for all matched artists
 * (Run monthly or so)
 */
export async function refreshPopularTracks(
  olderThanDays = 30,
  limit = 100
): Promise<{ updated: number; errors: number }> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)

  const artists = await prisma.artist.findMany({
    where: {
      spotifyId: { not: null },
      spotifyMatchStatus: { in: ['AUTO_MATCHED', 'VERIFIED'] },
      OR: [
        { spotifyTracksUpdatedAt: null },
        { spotifyTracksUpdatedAt: { lt: cutoff } },
      ],
    },
    take: limit,
  })

  let updated = 0
  let errors = 0

  for (const artist of artists) {
    try {
      const tracks = await spotifyService.getPopularTracks(artist.spotifyId!, 4)

      await prisma.artist.update({
        where: { id: artist.id },
        data: {
          spotifyPopularTracks: tracks,
          spotifyTracksUpdatedAt: new Date(),
        },
      })

      updated++
    } catch (err) {
      console.error(`Failed to refresh tracks for ${artist.name}:`, err)
      errors++
    }

    await sleep(DELAY_BETWEEN_ARTISTS_MS)
  }

  return { updated, errors }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
