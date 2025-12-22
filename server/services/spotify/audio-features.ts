/**
 * Spotify Artist Enrichment Service
 *
 * Fetches and updates Spotify genres for artists.
 *
 * Note: Audio features API was deprecated by Spotify in November 2024.
 * See: https://community.spotify.com/t5/Spotify-for-Developers/Web-API-Get-Track-s-Audio-Features-403-error/td-p/6654507
 */

import { Buffer } from 'node:buffer'
import { prisma } from '../../utils/prisma'

interface SpotifyArtistFullResponse {
  id: string
  name: string
  genres: string[]
  popularity: number
}

/**
 * Fetch Spotify genres for an artist by their Spotify ID
 */
export async function fetchSpotifyGenres(spotifyArtistId: string): Promise<string[]> {
  const token = await getClientToken()

  const response = await fetch(
    `https://api.spotify.com/v1/artists/${spotifyArtistId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!response.ok) {
    if (response.status === 404) {
      return []
    }
    const error = await response.text()
    throw new Error(`Failed to fetch artist: ${error}`)
  }

  const artist: SpotifyArtistFullResponse = await response.json()
  return artist.genres || []
}

/**
 * Enrich an artist with Spotify genres
 * Updates the artist record with spotifyGenres
 */
export async function enrichArtistWithSpotifyData(artistId: string): Promise<{
  success: boolean
  genres?: string[]
  error?: string
}> {
  try {
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: {
        id: true,
        name: true,
        spotifyId: true,
        spotifyMatchStatus: true,
      },
    })

    if (!artist) {
      return { success: false, error: 'Artist not found' }
    }

    if (!artist.spotifyId) {
      return { success: false, error: 'Artist has no Spotify ID' }
    }

    if (!['AUTO_MATCHED', 'VERIFIED'].includes(artist.spotifyMatchStatus)) {
      return { success: false, error: 'Artist Spotify match not confirmed' }
    }

    // Fetch genres
    const genres = await fetchSpotifyGenres(artist.spotifyId)

    // Update artist record
    await prisma.artist.update({
      where: { id: artistId },
      data: {
        spotifyGenres: genres,
        spotifyFetchedAt: new Date(),
      },
    })

    return {
      success: true,
      genres,
    }
  } catch (err) {
    console.error(`Error enriching artist ${artistId} with Spotify data:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Batch enrich multiple artists with Spotify genres
 */
export async function enrichArtistsWithSpotifyData(
  limit = 50
): Promise<{
  processed: number
  enriched: number
  errors: number
}> {
  // Find artists that have Spotify matches but haven't been enriched yet
  const artists = await prisma.artist.findMany({
    where: {
      spotifyId: { not: null },
      spotifyMatchStatus: { in: ['AUTO_MATCHED', 'VERIFIED'] },
      spotifyFetchedAt: null,
    },
    select: { id: true },
    take: limit,
  })

  let processed = 0
  let enriched = 0
  let errors = 0

  for (const artist of artists) {
    const result = await enrichArtistWithSpotifyData(artist.id)
    processed++

    if (result.success) {
      enriched++
    } else {
      errors++
    }

    // Small delay to avoid rate limits
    await sleep(100)
  }

  return { processed, enriched, errors }
}

// Helper to get client token
async function getClientToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials not configured')
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to get Spotify token')
  }

  const data = await response.json()
  return data.access_token
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
