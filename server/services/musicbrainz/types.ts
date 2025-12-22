/**
 * MusicBrainz API Types
 */

export interface MusicBrainzArtist {
  id: string
  name: string
  'sort-name': string
  type?: string // Person, Group, Orchestra, Choir, Character, Other
  country?: string
  disambiguation?: string
  'life-span'?: {
    begin?: string
    end?: string
    ended?: boolean
  }
  'begin-area'?: {
    id: string
    name: string
    'sort-name': string
  }
  area?: {
    id: string
    name: string
    'sort-name': string
  }
  tags?: MusicBrainzTag[]
  relations?: MusicBrainzRelation[]
}

export interface MusicBrainzTag {
  name: string
  count: number
}

export interface MusicBrainzRelation {
  type: string
  'type-id': string
  direction: 'forward' | 'backward'
  artist?: {
    id: string
    name: string
    type?: string
  }
  url?: {
    resource: string
  }
}

export interface MusicBrainzSearchResult {
  artists: MusicBrainzArtist[]
  count: number
  offset: number
}

export interface ArtistMatch {
  artist: MusicBrainzArtist
  confidence: number
}

export interface MusicBrainzArtistData {
  id: string
  name: string
  disambiguation?: string
  type?: string
  country?: string
  beginArea?: string // City/region where artist started
  tags: string[] // Sorted by popularity
  description?: string // From Wikipedia/Wikidata if available
  relatedArtistIds: string[] // MusicBrainz IDs of related artists
  urls: {
    wikipedia?: string
    wikidata?: string
    discogs?: string
    official?: string
    bandcamp?: string
    soundcloud?: string
  }
  socialLinks: {
    instagram?: string
    facebook?: string
    twitter?: string
    youtube?: string
    tiktok?: string
  }
}
