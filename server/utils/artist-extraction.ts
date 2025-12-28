/**
 * Artist extraction utilities
 * Extracts artist names from event titles and creates/links artist records
 */

import type { PrismaClient } from '@prisma/client'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Common event title prefixes that should be stripped
 * These patterns indicate the event title is "Event Description with/featuring Artist"
 */
const EVENT_PREFIX_PATTERNS = [
  // Holiday/Special events
  /^new\s+year'?s?\s+eve\s+(?:with|featuring|feat\.?|ft\.?)\s+/i,
  /^nye\s+(?:with|featuring|feat\.?|ft\.?)\s+/i,
  /^halloween\s+(?:party\s+)?(?:with|featuring|feat\.?|ft\.?)\s+/i,
  /^christmas\s+(?:party\s+)?(?:with|featuring|feat\.?|ft\.?)\s+/i,
  /^holiday\s+(?:party\s+)?(?:with|featuring|feat\.?|ft\.?)\s+/i,
  /^valentine'?s?\s+(?:day\s+)?(?:with|featuring|feat\.?|ft\.?)\s+/i,
  /^st\.?\s*patrick'?s?\s+(?:day\s+)?(?:with|featuring|feat\.?|ft\.?)\s+/i,

  // Generic event patterns
  /^(?:a\s+)?(?:special\s+)?(?:night|evening|afternoon|show|concert|performance|party|celebration)\s+(?:with|featuring|feat\.?|ft\.?)\s+/i,
  /^live\s+(?:music\s+)?(?:with|featuring|feat\.?|ft\.?)\s+/i,
  /^(?:an\s+)?intimate\s+(?:evening|night|show|performance)\s+(?:with|featuring|feat\.?|ft\.?)\s+/i,
  /^(?:a\s+)?(?:very\s+)?special\s+(?:evening|night|show)\s+(?:with|featuring|feat\.?|ft\.?)\s+/i,

  // Venue-specific patterns
  /^(?:music\s+)?(?:on|at)\s+(?:the\s+)?(?:patio|deck|lawn|stage|rooftop)\s+(?:with|featuring|feat\.?|ft\.?)\s+/i,

  // Day of week patterns
  /^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:night\s+)?(?:with|featuring|feat\.?|ft\.?)\s+/i,

  // Brunch/dinner patterns
  /^(?:sunday\s+)?(?:brunch|dinner|lunch)\s+(?:with|featuring|feat\.?|ft\.?)\s+/i,

  // Residency/series patterns
  /^(?:\w+\s+)?(?:residency|series)[:,]?\s+/i,

  // Presenter patterns (e.g., "Shea Presents: Artist Name")
  /^[\w\s]+\s+presents?[:,]?\s+/i,
]

/**
 * Event types/descriptions that should NOT be extracted as artist names
 */
const NON_ARTIST_PATTERNS = [
  /^live\s+music$/i,
  /^open\s+mic/i,
  /^karaoke/i,
  /^trivia/i,
  /^comedy/i,
  /^jam\s+session/i,
  /^dance\s+party/i,
  /^dj\s+night/i,
  /^private\s+event/i,
  /^gallery\s+opening/i,
  // "at [Venue]" patterns - anywhere in the string
  /^at\s+/i,
  /^live\s+at\s+/i,
  /^music\s+at\s+/i,
  /^salsa\s+(sundays?|nights?|dancing)/i,
  /^latin\s+dance/i,
  /^two[- ]step\s+night/i,
  /^line\s+dance/i,
  /^swing\s+dance/i,
  /^house\s+music/i,
  /^student\s+jazz/i,
  /^song\s+swap/i,
  /^queers?\s+gotta\s+dance/i,
  /^candlelight[:\s]/i,
  /tribute\s+(show|band|night|to)/i,
  /experience$/i,
  // Residency patterns that shouldn't become artist names
  /residency\s*[-–—:]/i,
  /sunday\s+residency/i,
  // More TBA/TBD patterns
  /^more\s+t[bo][da]$/i,
  // Night market, takeover type events
  /night\s+market/i,
  /takeover$/i,
  // Opera/classical series
  /^opera\s+on\s+tap/i,
  // BBQ type events
  /\bbbq\b/i,
  // House party
  /house\s+party/i,
  // Coffeehouse
  /coffeehouse/i,
  // Holiday show (without artist)
  /^holiday\s+show$/i,
  // Location fragments that slip through
  /^(in|on)\s+the\s+/i,
]

/**
 * Patterns to extract artist from "Event with Artist" format
 * Used after prefix patterns don't match
 */
const WITH_ARTIST_PATTERNS = [
  // "Something with Artist Name" - extract what comes after "with"
  /^.+?\s+(?:with|featuring|feat\.?|ft\.?)\s+(.+)$/i,
]

/**
 * Extract artist names from event title
 * Returns array of artist names (can be multiple for multi-artist shows)
 * Returns empty array if no artists can be extracted
 */
export function extractArtistNames(title: string): string[] {
  // Skip if contains emoji
  if (/[\u{1F300}-\u{1F9FF}]/u.test(title)) return []

  // Skip if starts with number (like "5Rhythms")
  if (/^\d+/.test(title)) return []

  let workingTitle = title.trim()

  // First, check if the entire title matches a non-artist pattern
  for (const pattern of NON_ARTIST_PATTERNS) {
    if (pattern.test(workingTitle)) return []
  }

  // Strip long descriptions after the first sentence-like break
  // e.g., "Band Name Get up and get ready..." -> "Band Name"
  const longDescMatch = workingTitle.match(/^([^.!?]{10,60})\s+[A-Z][a-z]+\s+[a-z]+\s+[a-z]+/)
  if (longDescMatch?.[1]) {
    workingTitle = longDescMatch[1].trim()
  }

  // Handle pipe separator - take first part only (usually "Artist | Venue Info")
  if (workingTitle.includes('|')) {
    const parts = workingTitle.split('|').map(p => p.trim())
    // Only use first part if it doesn't look like event metadata
    if (parts[0] && !/matinee|evening|morning|afternoon|performance|concert/i.test(parts[1] || '')) {
      workingTitle = parts[0]
    } else if (parts[0]) {
      // Take the non-metadata part
      workingTitle = parts[0]
    }
  }

  // Handle "Artist w/ Opener" or "Artist - w/ Opener" or "Artist w/Opener" patterns FIRST
  // (before slash splitting, since w/ contains a slash)
  const wSlashMatch = workingTitle.match(/^(.+?)\s+(?:-\s+)?w\/\s*(.+)$/i)
  if (wSlashMatch && wSlashMatch[1] && wSlashMatch[2]) {
    const headliner = cleanArtistName(wSlashMatch[1])
    const opener = cleanArtistName(wSlashMatch[2])
    const artists: string[] = []
    if (headliner && !isNonArtist(headliner)) artists.push(headliner)
    if (opener && !isNonArtist(opener)) artists.push(opener)
    if (artists.length > 0) return artists
  }

  // Also handle "Artist w/Opener" without space after w/
  const wSlashNoSpaceMatch = workingTitle.match(/^(.+?)\s+w\/(\S.*)$/i)
  if (wSlashNoSpaceMatch && wSlashNoSpaceMatch[1] && wSlashNoSpaceMatch[2]) {
    const headliner = cleanArtistName(wSlashNoSpaceMatch[1])
    const opener = cleanArtistName(wSlashNoSpaceMatch[2])
    const artists: string[] = []
    if (headliner && !isNonArtist(headliner)) artists.push(headliner)
    if (opener && !isNonArtist(opener)) artists.push(opener)
    if (artists.length > 0) return artists
  }

  // Handle slash-separated multi-artist shows
  // But skip if it looks like a date (e.g., "12/22/25")
  if (workingTitle.includes('/') && !/\d+\/\d+\/\d+/.test(workingTitle)) {
    const slashParts = workingTitle.split('/').map(p => p.trim()).filter(p => p.length > 0)
    // If we have 2-5 slash-separated parts, treat as multi-artist
    if (slashParts.length >= 2 && slashParts.length <= 5) {
      const artists: string[] = []
      for (const part of slashParts) {
        const cleaned = cleanArtistName(part)
        if (cleaned && !isNonArtist(cleaned)) {
          artists.push(cleaned)
        }
      }
      if (artists.length > 0) return artists
    }
  }

  // Try to extract from common event prefix patterns
  for (const pattern of EVENT_PREFIX_PATTERNS) {
    const match = workingTitle.match(pattern)
    if (match) {
      workingTitle = workingTitle.replace(pattern, '').trim()
      break
    }
  }

  // If no prefix pattern matched, try "X with Y" patterns
  if (workingTitle === title.trim()) {
    for (const pattern of WITH_ARTIST_PATTERNS) {
      const match = workingTitle.match(pattern)
      if (match?.[1]) {
        // Only use this if the prefix part looks like an event description
        const prefix = workingTitle.replace(match[1], '').replace(/\s+(?:with|featuring|feat\.?|ft\.?)\s*$/i, '').trim()
        const eventWords = /\b(night|evening|party|show|concert|celebration|nye|eve|day|brunch|dinner|special|live|music|presents?|series|kid'?s?)\b/i
        if (eventWords.test(prefix)) {
          workingTitle = match[1].trim()
          break
        }
      }
    }
  }

  // Handle "Live Music: X" or "LIVE Music - X" pattern
  const liveMusicMatch = workingTitle.match(/^live\s+music[:\s-]+\s*(.+)$/i)
  if (liveMusicMatch?.[1]) {
    workingTitle = liveMusicMatch[1].trim()
  }

  // Handle "An Evening with X" pattern
  const eveningMatch = workingTitle.match(/^an\s+evening\s+with\s+(.+?)(\s*\(.*\))?$/i)
  if (eveningMatch?.[1]) {
    workingTitle = eveningMatch[1].trim()
  }

  // Clean up the final result
  const cleaned = cleanArtistName(workingTitle)
  if (cleaned && !isNonArtist(cleaned)) {
    return [cleaned]
  }

  return []
}

/**
 * Clean up an artist name string
 */
function cleanArtistName(name: string): string | null {
  let artist = name.trim()

  // Strip time suffixes like "7-8pm", "9:30pm", "8-9:30pm"
  artist = artist.replace(/,?\s*\d{1,2}(:\d{2})?\s*-\s*\d{1,2}(:\d{2})?\s*(am|pm)$/i, '')
  artist = artist.replace(/,?\s*\d{1,2}(:\d{2})?\s*(am|pm)$/i, '')

  // Strip trailing parenthetical info like "(Acoustic)" or "(Solo)"
  artist = artist.replace(/\s*\([^)]*\)\s*$/, '').trim()

  // Strip common suffixes
  artist = artist.replace(/\s+LIVE$/i, '')
  artist = artist.replace(/\s+-\s*$/, '')

  // Skip if too short or too long
  artist = artist.trim()
  if (artist.length < 2 || artist.length > 80) return null

  // Skip if it looks like a sentence (too many words)
  const wordCount = artist.split(/\s+/).length
  if (wordCount > 10) return null

  return artist
}

/**
 * Check if a string looks like a non-artist event description
 */
function isNonArtist(text: string): boolean {
  for (const pattern of NON_ARTIST_PATTERNS) {
    if (pattern.test(text)) return true
  }
  return false
}

/**
 * Extract artist name from event title (legacy single-artist function)
 * Returns null if the title doesn't look like a clean artist name
 */
export function extractArtistName(title: string): string | null {
  const artists = extractArtistNames(title)
  return artists.length > 0 ? (artists[0] ?? null) : null
}

/**
 * Find an existing artist whose name appears in the event title
 * This helps match titles like "Gallery Opening for Emily Tatro" to artist "Emily Tatro"
 * Only matches verified/matched artists to avoid false positives
 */
export async function findArtistInTitle(
  prisma: PrismaClient,
  eventTitle: string
): Promise<{ id: string; name: string; slug: string } | null> {
  const titleLower = eventTitle.toLowerCase()

  // Get verified/matched artists (curated list)
  // Only check artists with Spotify verification or manual verification
  const verifiedArtists = await prisma.artist.findMany({
    where: {
      OR: [
        { spotifyMatchStatus: 'VERIFIED' },
        { spotifyMatchStatus: 'AUTO_MATCHED' },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: {
      // Prefer longer names first to match "The John Doe Band" before "John Doe"
      name: 'desc',
    },
  })

  // Sort by name length descending to prefer longer matches
  verifiedArtists.sort((a, b) => b.name.length - a.name.length)

  for (const artist of verifiedArtists) {
    const artistNameLower = artist.name.toLowerCase()
    // Check if artist name appears as a whole word/phrase in the title
    // Use word boundaries to avoid partial matches (e.g., "Art" matching "Arthur")
    const escapedName = artistNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escapedName}\\b`, 'i')
    if (regex.test(titleLower)) {
      return artist
    }
  }

  return null
}

/**
 * Extract artists from event title and link to event
 * Creates new artists if needed, or links to existing ones
 * Now supports multiple artists per event
 */
export async function extractAndLinkArtists(
  prisma: PrismaClient,
  eventId: string,
  eventTitle: string
): Promise<Array<{ artistId: string; artistName: string }>> {
  const results: Array<{ artistId: string; artistName: string }> = []

  // First, try to match against existing verified artists
  const existingArtist = await findArtistInTitle(prisma, eventTitle)
  if (existingArtist) {
    try {
      await prisma.eventArtist.upsert({
        where: {
          eventId_artistId: {
            eventId,
            artistId: existingArtist.id,
          },
        },
        update: {},
        create: {
          eventId,
          artistId: existingArtist.id,
          order: 1,
        },
      })
      results.push({ artistId: existingArtist.id, artistName: existingArtist.name })
    } catch {
      // Continue to pattern-based extraction
    }
  }

  // If we found a verified artist, don't do pattern extraction (could create duplicates)
  if (results.length > 0) return results

  // Fall back to pattern-based extraction
  const artistNames = extractArtistNames(eventTitle)

  for (let i = 0; i < artistNames.length; i++) {
    const artistName = artistNames[i]
    if (!artistName) continue
    const slug = slugify(artistName)
    if (!slug || slug.length < 2) continue

    try {
      // Find or create artist
      let artist = await prisma.artist.findUnique({
        where: { slug },
      })

      if (!artist) {
        artist = await prisma.artist.create({
          data: {
            name: artistName,
            slug,
            spotifyMatchStatus: 'PENDING',
          },
        })
      }

      // Link artist to event
      await prisma.eventArtist.upsert({
        where: {
          eventId_artistId: {
            eventId,
            artistId: artist.id,
          },
        },
        update: {},
        create: {
          eventId,
          artistId: artist.id,
          order: i + 1, // First artist is headliner (order 1)
        },
      })

      results.push({ artistId: artist.id, artistName: artist.name })
    } catch {
      // Silently ignore errors (e.g., race conditions)
    }
  }

  return results
}

/**
 * Legacy function for backwards compatibility
 */
export async function extractAndLinkArtist(
  prisma: PrismaClient,
  eventId: string,
  eventTitle: string
): Promise<{ artistId: string; artistName: string } | null> {
  const results = await extractAndLinkArtists(prisma, eventId, eventTitle)
  return results.length > 0 ? (results[0] ?? null) : null
}
