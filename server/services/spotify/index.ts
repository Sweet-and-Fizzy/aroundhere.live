/**
 * Spotify Service
 *
 * Handles all Spotify API interactions:
 * - Client credentials auth for search/read operations
 * - OAuth flow for playlist management
 * - Artist search with fuzzy matching
 * - Top tracks retrieval
 * - Playlist management
 */

import { Buffer } from 'node:buffer'
import { prisma } from '../../utils/prisma'
import type {
  SpotifyArtist,
  SpotifyTrack,
  SpotifySearchResult,
  SpotifyTopTracksResult,
  SpotifyTokenResponse,
  SpotifyUserProfile,
  SpotifyPlaylist,
  ArtistMatch,
  PopularTrack,
} from './types'

export * from './types'

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com'

// Scopes needed for playlist management
const OAUTH_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ')

class SpotifyService {
  private clientId: string | null
  private clientSecret: string | null
  private clientCredentialsToken: string | null = null
  private clientCredentialsExpiry: Date | null = null

  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID || null
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || null
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret)
  }

  /**
   * Get the OAuth authorization URL for initial setup
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    if (!this.clientId) {
      throw new Error('Spotify client ID not configured')
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: OAUTH_SCOPES,
      state,
    })

    return `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens (OAuth flow)
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<SpotifyTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Spotify credentials not configured')
    }

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${this.clientId}:${this.clientSecret}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to exchange code: ${error}`)
    }

    const tokens: SpotifyTokenResponse = await response.json()

    // Store tokens in database
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    await prisma.spotifyAuth.upsert({
      where: { id: 'spotify_auth' },
      create: {
        id: 'spotify_auth',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        expiresAt,
        scope: tokens.scope || OAUTH_SCOPES,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        expiresAt,
        scope: tokens.scope || OAUTH_SCOPES,
      },
    })

    // Fetch and store user ID
    const profile = await this.getCurrentUserProfile(tokens.access_token)
    await prisma.spotifyAuth.update({
      where: { id: 'spotify_auth' },
      data: { userId: profile.id },
    })

    return tokens
  }

  /**
   * Get client credentials token (for search/read operations)
   */
  private async getClientCredentialsToken(): Promise<string> {
    // Return cached token if still valid
    if (
      this.clientCredentialsToken &&
      this.clientCredentialsExpiry &&
      this.clientCredentialsExpiry > new Date()
    ) {
      return this.clientCredentialsToken
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Spotify credentials not configured')
    }

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${this.clientId}:${this.clientSecret}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to get client credentials: ${error}`)
    }

    const data: SpotifyTokenResponse = await response.json()

    this.clientCredentialsToken = data.access_token
    // Expire 5 minutes early to be safe
    this.clientCredentialsExpiry = new Date(
      Date.now() + (data.expires_in - 300) * 1000
    )

    return data.access_token
  }

  /**
   * Get OAuth token for playlist operations (auto-refreshes if needed)
   */
  private async getOAuthToken(): Promise<string> {
    const auth = await prisma.spotifyAuth.findUnique({
      where: { id: 'spotify_auth' },
    })

    if (!auth) {
      throw new Error('Spotify not authorized. Please complete OAuth setup.')
    }

    // Check if token is still valid (with 5 min buffer)
    if (auth.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
      return auth.accessToken
    }

    // Refresh the token
    return this.refreshAccessToken(auth.refreshToken)
  }

  /**
   * Refresh an expired access token
   */
  private async refreshAccessToken(refreshToken: string): Promise<string> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Spotify credentials not configured')
    }

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${this.clientId}:${this.clientSecret}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh token: ${error}`)
    }

    const data: SpotifyTokenResponse = await response.json()
    const expiresAt = new Date(Date.now() + data.expires_in * 1000)

    // Update stored tokens
    await prisma.spotifyAuth.update({
      where: { id: 'spotify_auth' },
      data: {
        accessToken: data.access_token,
        // Spotify may return a new refresh token
        ...(data.refresh_token && { refreshToken: data.refresh_token }),
        expiresAt,
      },
    })

    return data.access_token
  }

  /**
   * Check if OAuth is set up
   */
  async isOAuthConfigured(): Promise<boolean> {
    const auth = await prisma.spotifyAuth.findUnique({
      where: { id: 'spotify_auth' },
    })
    return !!auth
  }

  /**
   * Get current user profile
   */
  private async getCurrentUserProfile(
    accessToken: string
  ): Promise<SpotifyUserProfile> {
    const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to get user profile')
    }

    return response.json()
  }

  // ============================================
  // Artist Search & Matching
  // ============================================

  /**
   * Get an artist by their Spotify ID
   */
  async getArtistById(artistId: string): Promise<SpotifyArtist | null> {
    const token = await this.getClientCredentialsToken()

    const response = await fetch(`${SPOTIFY_API_BASE}/artists/${artistId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      const error = await response.text()
      throw new Error(`Get artist failed: ${error}`)
    }

    const artist = await response.json()
    return {
      id: artist.id,
      name: artist.name,
      popularity: artist.popularity,
      genres: artist.genres,
      images: artist.images,
      external_urls: artist.external_urls,
    }
  }

  /**
   * Search for an artist by name
   */
  async searchArtist(name: string, limit = 5): Promise<SpotifyArtist[]> {
    const token = await this.getClientCredentialsToken()

    const params = new URLSearchParams({
      q: name,
      type: 'artist',
      limit: limit.toString(),
    })

    const response = await fetch(
      `${SPOTIFY_API_BASE}/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Artist search failed: ${error}`)
    }

    const data: SpotifySearchResult = await response.json()
    return data.artists.items
  }

  /**
   * Search and match an artist with confidence scoring
   */
  async matchArtist(name: string): Promise<ArtistMatch | null> {
    const results = await this.searchArtist(name, 5)

    if (results.length === 0) {
      return null
    }

    // Calculate confidence for each result
    const matches: ArtistMatch[] = results.map((artist) => ({
      artist,
      confidence: this.calculateNameConfidence(name, artist.name),
    }))

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence)

    const bestMatch = matches[0]

    // Only return if there's some reasonable confidence
    if (!bestMatch || bestMatch.confidence < 0.3) {
      return null
    }

    return bestMatch
  }

  /**
   * Calculate name similarity confidence (0-1)
   */
  private calculateNameConfidence(ourName: string, spotifyName: string): number {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    const a = normalize(ourName)
    const b = normalize(spotifyName)

    // Exact match
    if (a === b) return 1.0

    // One contains the other
    if (a.includes(b) || b.includes(a)) {
      const shorter = a.length < b.length ? a : b
      const longer = a.length < b.length ? b : a
      return 0.8 + (shorter.length / longer.length) * 0.15
    }

    // Levenshtein distance-based similarity
    const distance = this.levenshteinDistance(a, b)
    const maxLen = Math.max(a.length, b.length)
    const similarity = 1 - distance / maxLen

    return Math.max(0, similarity)
  }

  /**
   * Levenshtein distance for fuzzy matching
   */
  private levenshteinDistance(a: string, b: string): number {
    // Initialize matrix with proper dimensions
    const matrix: number[][] = Array.from({ length: b.length + 1 }, () =>
      Array.from({ length: a.length + 1 }, () => 0)
    )

    for (let i = 0; i <= b.length; i++) {
      matrix[i]![0] = i
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1
          )
        }
      }
    }

    return matrix[b.length]![a.length]!
  }

  // ============================================
  // Top Tracks
  // ============================================

  /**
   * Get an artist's top tracks
   */
  async getArtistTopTracks(
    artistId: string,
    market = 'US'
  ): Promise<SpotifyTrack[]> {
    const token = await this.getClientCredentialsToken()

    const response = await fetch(
      `${SPOTIFY_API_BASE}/artists/${artistId}/top-tracks?market=${market}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to get top tracks: ${error}`)
    }

    const data: SpotifyTopTracksResult = await response.json()
    return data.tracks
  }

  /**
   * Get top N tracks formatted for storage
   */
  async getPopularTracks(
    artistId: string,
    count = 4
  ): Promise<PopularTrack[]> {
    const tracks = await this.getArtistTopTracks(artistId)

    return tracks.slice(0, count).map((track) => ({
      trackId: track.id,
      name: track.name,
      uri: track.uri,
      durationMs: track.duration_ms,
    }))
  }

  // ============================================
  // Playlist Management (requires OAuth)
  // ============================================

  /**
   * Get a playlist's current tracks
   */
  async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const token = await this.getOAuthToken()
    const tracks: SpotifyTrack[] = []
    let url: string | null =
      `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=100`

    while (url) {
      const response: Response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to get playlist tracks: ${error}`)
      }

      const data = await response.json() as { items: { track: SpotifyTrack }[]; next: string | null }
      tracks.push(...data.items.map((item) => item.track))
      url = data.next
    }

    return tracks
  }

  /**
   * Add tracks to a playlist
   */
  async addTracksToPlaylist(
    playlistId: string,
    trackUris: string[]
  ): Promise<void> {
    if (trackUris.length === 0) return

    const token = await this.getOAuthToken()

    // Spotify allows max 100 tracks per request
    for (let i = 0; i < trackUris.length; i += 100) {
      const batch = trackUris.slice(i, i + 100)

      const response = await fetch(
        `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: batch }),
        }
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to add tracks: ${error}`)
      }
    }
  }

  /**
   * Remove tracks from a playlist
   */
  async removeTracksFromPlaylist(
    playlistId: string,
    trackUris: string[]
  ): Promise<void> {
    if (trackUris.length === 0) return

    const token = await this.getOAuthToken()

    // Spotify allows max 100 tracks per request
    for (let i = 0; i < trackUris.length; i += 100) {
      const batch = trackUris.slice(i, i + 100)

      const response = await fetch(
        `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tracks: batch.map((uri) => ({ uri })),
          }),
        }
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to remove tracks: ${error}`)
      }
    }
  }

  /**
   * Replace all tracks in a playlist (for reordering)
   */
  async replacePlaylistTracks(
    playlistId: string,
    trackUris: string[]
  ): Promise<void> {
    const token = await this.getOAuthToken()

    // First request can have up to 100 URIs
    const firstBatch = trackUris.slice(0, 100)
    const remaining = trackUris.slice(100)

    const response = await fetch(
      `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: firstBatch }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to replace tracks: ${error}`)
    }

    // Add remaining tracks if any
    if (remaining.length > 0) {
      await this.addTracksToPlaylist(playlistId, remaining)
    }
  }

  /**
   * Get playlist details
   */
  async getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    const token = await this.getOAuthToken()

    const response = await fetch(
      `${SPOTIFY_API_BASE}/playlists/${playlistId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to get playlist: ${error}`)
    }

    return response.json()
  }
}

// Singleton instance
const globalForSpotify = globalThis as unknown as {
  spotifyService: SpotifyService | undefined
}

export const spotifyService =
  globalForSpotify.spotifyService ?? new SpotifyService()

if (process.env.NODE_ENV !== 'production') {
  globalForSpotify.spotifyService = spotifyService
}

export default spotifyService
