/**
 * MusicBrainz Artist Matcher Service
 *
 * Processes artists with PENDING MusicBrainz status:
 * - Searches MusicBrainz for matches
 * - Calculates confidence scores
 * - Updates status to AUTO_MATCHED, NEEDS_REVIEW, or NO_MATCH
 * - Fetches tags and related artists for matched artists
 */

import { prisma } from '../../utils/prisma'
import { musicBrainzService } from './index'
import type { MusicBrainzMatchStatus } from '@prisma/client'

// Confidence thresholds (same as Spotify)
const AUTO_MATCH_THRESHOLD = 0.9 // >= 0.9 = auto-matched
const REVIEW_THRESHOLD = 0.5 // 0.5-0.9 = needs review, < 0.5 = no match

// Rate limiting handled by the service, but add batch delay
const DELAY_BETWEEN_ARTISTS_MS = 100 // Additional delay between artists

export interface MatchResult {
  artistId: string
  artistName: string
  status: MusicBrainzMatchStatus
  musicbrainzId?: string
  confidence?: number
  tagsCount?: number
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
export async function matchPendingArtists(limit = 50): Promise<MatchJobResult> {
  // Get pending artists (prioritize those with existing musicbrainzId)
  const pendingArtists = await prisma.artist.findMany({
    where: {
      musicbrainzMatchStatus: 'PENDING',
    },
    take: limit,
    orderBy: [
      // Artists with existing musicbrainzId first (just need enrichment)
      { musicbrainzId: 'desc' },
      { createdAt: 'asc' },
    ],
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
    const matchResult = await matchSingleArtist(
      artist.id,
      artist.name,
      artist.musicbrainzId
    )
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

    // Additional delay between artists
    if (result.processed < pendingArtists.length) {
      await sleep(DELAY_BETWEEN_ARTISTS_MS)
    }
  }

  return result
}

/**
 * Match a single artist by ID
 * If musicbrainzId is already set, just fetch the data
 */
export async function matchSingleArtist(
  artistId: string,
  artistName: string,
  existingMbid?: string | null
): Promise<MatchResult> {
  try {
    let mbid: string | null = existingMbid || null
    let confidence = 1.0

    // If no existing MBID, search for a match
    if (!mbid) {
      const match = await musicBrainzService.matchArtist(artistName)

      if (!match) {
        await prisma.artist.update({
          where: { id: artistId },
          data: {
            musicbrainzMatchStatus: 'NO_MATCH',
            musicbrainzMatchConfidence: 0,
          },
        })

        return {
          artistId,
          artistName,
          status: 'NO_MATCH',
        }
      }

      mbid = match.artist.id
      confidence = match.confidence
    }

    // Determine status based on confidence
    let status: MusicBrainzMatchStatus
    if (confidence >= AUTO_MATCH_THRESHOLD) {
      status = 'AUTO_MATCHED'
    } else if (confidence >= REVIEW_THRESHOLD) {
      status = 'NEEDS_REVIEW'
    } else {
      status = 'NO_MATCH'
    }

    // Fetch full artist data for matched or needs-review artists
    let artistData = null
    let wikipediaDescription: string | null = null

    if (status === 'AUTO_MATCHED' || status === 'NEEDS_REVIEW') {
      try {
        artistData = await musicBrainzService.fetchArtistData(mbid)

        // Fetch Wikipedia description if we have a Wikidata URL
        if (artistData?.urls.wikidata) {
          try {
            wikipediaDescription = await musicBrainzService.fetchWikipediaDescription(
              artistData.urls.wikidata
            )
          } catch (err) {
            console.warn(`Failed to fetch Wikipedia description for ${artistName}:`, err)
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch MusicBrainz data for ${artistName}:`, err)
      }
    }

    // Build social links object (merge with existing if any)
    const socialLinks: Record<string, string> = {}
    if (artistData?.socialLinks.instagram) socialLinks.instagram = artistData.socialLinks.instagram
    if (artistData?.socialLinks.facebook) socialLinks.facebook = artistData.socialLinks.facebook
    if (artistData?.socialLinks.twitter) socialLinks.twitter = artistData.socialLinks.twitter
    if (artistData?.socialLinks.youtube) socialLinks.youtube = artistData.socialLinks.youtube
    if (artistData?.socialLinks.tiktok) socialLinks.tiktok = artistData.socialLinks.tiktok
    if (artistData?.urls.bandcamp) socialLinks.bandcamp = artistData.urls.bandcamp
    if (artistData?.urls.soundcloud) socialLinks.soundcloud = artistData.urls.soundcloud

    // Update artist record
    await prisma.artist.update({
      where: { id: artistId },
      data: {
        musicbrainzId: mbid,
        musicbrainzMatchConfidence: confidence,
        musicbrainzMatchStatus: status,
        musicbrainzTags: artistData?.tags || [],
        musicbrainzDescription: wikipediaDescription || null,
        musicbrainzRelatedIds: artistData?.relatedArtistIds || [],
        musicbrainzFetchedAt: artistData ? new Date() : null,
        // Enrich artist with website and social links from MusicBrainz
        ...(artistData?.urls.official && { website: artistData.urls.official }),
        ...(Object.keys(socialLinks).length > 0 && { socialLinks }),
      },
    })

    return {
      artistId,
      artistName,
      status,
      musicbrainzId: mbid,
      confidence,
      tagsCount: artistData?.tags.length || 0,
    }
  } catch (err) {
    console.error(`Error matching artist ${artistName}:`, err)

    return {
      artistId,
      artistName,
      status: 'PENDING', // Keep pending on error to retry later
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Manually set an artist's MusicBrainz match
 */
export async function manuallyMatchArtist(
  artistId: string,
  musicbrainzId: string
): Promise<MatchResult> {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
  })

  if (!artist) {
    throw new Error('Artist not found')
  }

  try {
    const artistData = await musicBrainzService.fetchArtistData(musicbrainzId)

    if (!artistData) {
      throw new Error(`Invalid MusicBrainz artist ID: ${musicbrainzId}`)
    }

    // Fetch Wikipedia description if we have a Wikidata URL
    let wikipediaDescription: string | null = null
    if (artistData.urls.wikidata) {
      try {
        wikipediaDescription = await musicBrainzService.fetchWikipediaDescription(
          artistData.urls.wikidata
        )
      } catch (err) {
        console.warn(`Failed to fetch Wikipedia description for ${artist.name}:`, err)
      }
    }

    // Build social links object
    const socialLinks: Record<string, string> = {}
    if (artistData.socialLinks.instagram) socialLinks.instagram = artistData.socialLinks.instagram
    if (artistData.socialLinks.facebook) socialLinks.facebook = artistData.socialLinks.facebook
    if (artistData.socialLinks.twitter) socialLinks.twitter = artistData.socialLinks.twitter
    if (artistData.socialLinks.youtube) socialLinks.youtube = artistData.socialLinks.youtube
    if (artistData.socialLinks.tiktok) socialLinks.tiktok = artistData.socialLinks.tiktok
    if (artistData.urls.bandcamp) socialLinks.bandcamp = artistData.urls.bandcamp
    if (artistData.urls.soundcloud) socialLinks.soundcloud = artistData.urls.soundcloud

    await prisma.artist.update({
      where: { id: artistId },
      data: {
        musicbrainzId,
        musicbrainzMatchConfidence: 1.0, // Manual = 100% confidence
        musicbrainzMatchStatus: 'VERIFIED',
        musicbrainzTags: artistData.tags,
        musicbrainzDescription: wikipediaDescription || null,
        musicbrainzRelatedIds: artistData.relatedArtistIds,
        musicbrainzFetchedAt: new Date(),
        // Enrich artist with website and social links from MusicBrainz
        ...(artistData.urls.official && { website: artistData.urls.official }),
        ...(Object.keys(socialLinks).length > 0 && { socialLinks }),
      },
    })

    return {
      artistId,
      artistName: artist.name,
      status: 'VERIFIED',
      musicbrainzId,
      confidence: 1.0,
      tagsCount: artistData.tags.length,
    }
  } catch (err) {
    throw new Error(
      `Failed to match artist: ${err instanceof Error ? err.message : 'Unknown error'}`
    )
  }
}

/**
 * Mark an artist as having no MusicBrainz presence
 */
export async function markArtistNoMatch(artistId: string): Promise<void> {
  await prisma.artist.update({
    where: { id: artistId },
    data: {
      musicbrainzId: null,
      musicbrainzMatchConfidence: null,
      musicbrainzMatchStatus: 'NO_MATCH',
      musicbrainzTags: [],
      musicbrainzDescription: null,
      musicbrainzRelatedIds: [],
      musicbrainzFetchedAt: null,
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
      musicbrainzMatchConfidence: null,
      musicbrainzMatchStatus: 'PENDING',
      musicbrainzTags: [],
      musicbrainzDescription: null,
      musicbrainzRelatedIds: [],
      musicbrainzFetchedAt: null,
      // Keep musicbrainzId if it exists - we can re-fetch data
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
  const [pending, autoMatched, needsReview, verified, noMatch] = await Promise.all([
    prisma.artist.count({ where: { musicbrainzMatchStatus: 'PENDING' } }),
    prisma.artist.count({ where: { musicbrainzMatchStatus: 'AUTO_MATCHED' } }),
    prisma.artist.count({ where: { musicbrainzMatchStatus: 'NEEDS_REVIEW' } }),
    prisma.artist.count({ where: { musicbrainzMatchStatus: 'VERIFIED' } }),
    prisma.artist.count({ where: { musicbrainzMatchStatus: 'NO_MATCH' } }),
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
