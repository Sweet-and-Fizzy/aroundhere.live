/**
 * MusicBrainz Service
 *
 * Handles all MusicBrainz API interactions:
 * - Artist search with fuzzy matching
 * - Artist data retrieval (tags, relations, description)
 * - Rate limiting (1 request per second max)
 */

import type {
  MusicBrainzArtist,
  MusicBrainzSearchResult,
  MusicBrainzArtistData,
  ArtistMatch,
} from './types'

export * from './types'

const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2'
const USER_AGENT = 'AroundHere/1.0 (contact@aroundhere.live)'

// Rate limiting: MusicBrainz requires max 1 request per second
// With authentication token, can go slightly faster but we stay conservative
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL_MS = 1100 // Slightly over 1 second to be safe

class MusicBrainzService {
  private token: string | null

  constructor() {
    this.token = process.env.MUSICBRAINZ_TOKEN || null
  }

  /**
   * Check if the service has an auth token configured
   */
  hasToken(): boolean {
    return !!this.token
  }

  /**
   * Ensure we don't exceed rate limits
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest)
    }
    lastRequestTime = Date.now()
  }

  /**
   * Make a request to the MusicBrainz API
   */
  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    await this.rateLimit()

    const url = new URL(`${MUSICBRAINZ_API_BASE}${endpoint}`)
    url.searchParams.set('fmt', 'json')
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }

    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    }

    // Add auth token if available (for higher rate limits)
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    const response = await fetch(url.toString(), { headers })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`MusicBrainz API error: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  /**
   * Search for an artist by name
   */
  async searchArtist(name: string, limit = 5): Promise<MusicBrainzArtist[]> {
    // Escape special Lucene query characters but allow fuzzy matching
    const escapedName = name.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&')

    // Use unquoted query for fuzzy matching - MusicBrainz will match partial names
    // Also search aliases which catches alternate names/spellings
    const result = await this.request<MusicBrainzSearchResult>('/artist', {
      query: `artist:${escapedName}* OR alias:${escapedName}*`,
      limit: String(limit),
    })

    return result.artists || []
  }

  /**
   * Get detailed artist info by MusicBrainz ID
   */
  async getArtist(mbid: string): Promise<MusicBrainzArtist | null> {
    try {
      const artist = await this.request<MusicBrainzArtist>(`/artist/${mbid}`, {
        inc: 'tags+url-rels+artist-rels',
      })
      return artist
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        return null
      }
      throw err
    }
  }

  /**
   * Match an artist name and return the best match with confidence score
   */
  async matchArtist(name: string): Promise<ArtistMatch | null> {
    const results = await this.searchArtist(name, 5)

    if (results.length === 0) {
      return null
    }

    // Calculate confidence scores based on name similarity
    const matches = results.map(artist => ({
      artist,
      confidence: calculateNameSimilarity(name, artist.name),
    }))

    // Sort by confidence and return the best match
    matches.sort((a, b) => b.confidence - a.confidence)
    const bestMatch = matches[0]

    // Only return if confidence is above minimum threshold
    if (bestMatch && bestMatch.confidence >= 0.3) {
      return bestMatch
    }

    return null
  }

  /**
   * Fetch full artist data including tags, relations, and URLs
   */
  async fetchArtistData(mbid: string): Promise<MusicBrainzArtistData | null> {
    const artist = await this.getArtist(mbid)

    if (!artist) {
      return null
    }

    // Extract tags (sorted by count)
    const tags = (artist.tags || [])
      .sort((a, b) => b.count - a.count)
      .map(t => t.name)
      .slice(0, 20) // Limit to top 20 tags

    // Extract related artists from relations
    const relatedArtistIds: string[] = []
    const urls: MusicBrainzArtistData['urls'] = {}
    const socialLinks: MusicBrainzArtistData['socialLinks'] = {}

    for (const rel of artist.relations || []) {
      // Related artists
      if (rel.artist && rel.type !== 'is person') {
        relatedArtistIds.push(rel.artist.id)
      }

      // URLs
      if (rel.url?.resource) {
        const url = rel.url.resource

        // Official website
        if (rel.type === 'official homepage') {
          urls.official = url
        }
        // Wikipedia/Wikidata
        else if (url.includes('wikipedia.org')) {
          urls.wikipedia = url
        } else if (url.includes('wikidata.org')) {
          urls.wikidata = url
        }
        // Music platforms
        else if (url.includes('discogs.com')) {
          urls.discogs = url
        } else if (url.includes('bandcamp.com')) {
          urls.bandcamp = url
        } else if (url.includes('soundcloud.com')) {
          urls.soundcloud = url
        }
        // Social links (from "social network" relation type)
        else if (rel.type === 'social network') {
          if (url.includes('instagram.com')) {
            socialLinks.instagram = url
          } else if (url.includes('facebook.com')) {
            socialLinks.facebook = url
          } else if (url.includes('twitter.com') || url.includes('x.com')) {
            socialLinks.twitter = url
          } else if (url.includes('youtube.com')) {
            socialLinks.youtube = url
          } else if (url.includes('tiktok.com')) {
            socialLinks.tiktok = url
          }
        }
      }
    }

    return {
      id: artist.id,
      name: artist.name,
      disambiguation: artist.disambiguation,
      type: artist.type,
      country: artist.country,
      beginArea: artist['begin-area']?.name,
      tags,
      relatedArtistIds: [...new Set(relatedArtistIds)], // Dedupe
      urls,
      socialLinks,
    }
  }

  /**
   * Fetch Wikipedia description via Wikidata
   * Gets the full article intro (multiple paragraphs) not just the summary
   */
  async fetchWikipediaDescription(wikidataUrl: string): Promise<string | null> {
    try {
      // Extract Wikidata ID from URL (e.g., "https://www.wikidata.org/wiki/Q1182489" -> "Q1182489")
      const wikidataId = wikidataUrl.split('/').pop()
      if (!wikidataId) return null

      // Fetch from Wikidata API to get Wikipedia article title
      const wikidataResponse = await fetch(
        `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`,
        { headers: { 'User-Agent': USER_AGENT } }
      )

      if (!wikidataResponse.ok) return null

      const wikidataData = await wikidataResponse.json()
      const entity = wikidataData.entities?.[wikidataId]

      // Get English Wikipedia article title
      const enWikiTitle = entity?.sitelinks?.enwiki?.title
      if (!enWikiTitle) return null

      // Fetch full Wikipedia article extract using MediaWiki API
      // exintro=false gets full article, explaintext=true gets plain text
      const wikiResponse = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(enWikiTitle)}&prop=extracts&exintro=true&explaintext=true&format=json`,
        { headers: { 'User-Agent': USER_AGENT } }
      )

      if (!wikiResponse.ok) return null

      const wikiData = await wikiResponse.json()
      const pages = wikiData.query?.pages
      if (!pages) return null

      // Get the first (and only) page result
      const pageIds = Object.keys(pages)
      const pageId = pageIds[0]
      if (!pageId) return null
      const extract = pages[pageId]?.extract

      if (!extract) return null

      // Clean up the extract - remove excessive newlines, trim
      return extract
        .replace(/\n{3,}/g, '\n\n') // Max 2 newlines in a row
        .trim()
        .slice(0, 2000) // Limit to 2000 chars to avoid huge bios
    } catch (err) {
      console.error('Error fetching Wikipedia description:', err)
      return null
    }
  }
}

/**
 * Calculate name similarity using a combination of techniques
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const n1 = normalize(name1)
  const n2 = normalize(name2)

  // Exact match
  if (n1 === n2) {
    return 1.0
  }

  // One contains the other (common for "The X" vs "X")
  if (n1.includes(n2) || n2.includes(n1)) {
    const lengthRatio = Math.min(n1.length, n2.length) / Math.max(n1.length, n2.length)
    return 0.8 + lengthRatio * 0.15
  }

  // Levenshtein distance
  const distance = levenshteinDistance(n1, n2)
  const maxLength = Math.max(n1.length, n2.length)
  const similarity = 1 - distance / maxLength

  return Math.max(0, similarity)
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length

  if (m === 0) return n
  if (n === 0) return m

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0) as number[])

  for (let i = 0; i <= m; i++) {
    dp[i]![0] = i
  }
  for (let j = 0; j <= n; j++) {
    dp[0]![j] = j
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!
      } else {
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1, // deletion
          dp[i]![j - 1]! + 1, // insertion
          dp[i - 1]![j - 1]! + 1 // substitution
        )
      }
    }
  }

  return dp[m]![n]!
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Singleton instance
export const musicBrainzService = new MusicBrainzService()
