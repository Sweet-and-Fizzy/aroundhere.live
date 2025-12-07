/**
 * Spotify API Types
 */

export interface SpotifyArtist {
  id: string
  name: string
  uri: string
  popularity: number
  genres: string[]
  images: SpotifyImage[]
  external_urls: {
    spotify: string
  }
}

export interface SpotifyImage {
  url: string
  height: number
  width: number
}

export interface SpotifyTrack {
  id: string
  name: string
  uri: string
  duration_ms: number
  popularity: number
  preview_url: string | null
  album: {
    id: string
    name: string
    images: SpotifyImage[]
  }
  artists: {
    id: string
    name: string
  }[]
  external_urls: {
    spotify: string
  }
}

export interface SpotifySearchResult {
  artists: {
    items: SpotifyArtist[]
    total: number
  }
}

export interface SpotifyTopTracksResult {
  tracks: SpotifyTrack[]
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  uri: string
  tracks: {
    total: number
    items: {
      track: SpotifyTrack
      added_at: string
    }[]
  }
  external_urls: {
    spotify: string
  }
}

export interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

export interface SpotifyUserProfile {
  id: string
  display_name: string
  email: string
  external_urls: {
    spotify: string
  }
}

export interface ArtistMatch {
  artist: SpotifyArtist
  confidence: number
}

export interface PopularTrack {
  trackId: string
  name: string
  uri: string
  durationMs: number
}
