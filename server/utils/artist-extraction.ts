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
 * Extract artist name from event title
 * Returns null if the title doesn't look like a clean artist name
 */
export function extractArtistName(title: string): string | null {
  // Skip titles with multiple artists (slashes indicate local multi-band shows)
  if ((title.match(/\//g) || []).length > 0) return null
  if ((title.match(/\|/g) || []).length > 0) return null

  // Skip if starts with number (like "5Rhythms")
  if (/^\d+/.test(title)) return null

  // Skip if contains emoji
  if (/[\u{1F300}-\u{1F9FF}]/u.test(title)) return null

  let artist = title.trim()

  // Handle "Live Music: X" or "LIVE Music - X" pattern
  const liveMusicMatch = artist.match(/^live\s+music[:\s-]+\s*(.+)$/i)
  if (liveMusicMatch) {
    artist = liveMusicMatch[1].trim()
  }

  // Handle "An Evening with X" pattern
  const eveningMatch = artist.match(/^an evening with\s+(.+?)(\s*\(.*\))?$/i)
  if (eveningMatch) {
    artist = eveningMatch[1].trim()
  }

  // Handle "X - w/ Y" pattern (take headliner only)
  const wMatch = artist.match(/^(.+?)\s+-\s+w\/\s+/i)
  if (wMatch) {
    artist = wMatch[1].trim()
  }

  // Strip time suffixes like "7-8pm", "9:30pm", "8-9:30pm"
  artist = artist.replace(/,?\s*\d{1,2}(:\d{2})?\s*-?\s*\d{0,2}(:\d{2})?\s*(am|pm)?$/i, '')

  // Skip if still contains "w/" (nested openers)
  if (/\sw\/\s/i.test(artist)) return null

  // Skip if too short or too long
  artist = artist.trim()
  if (artist.length < 3 || artist.length > 80) return null

  // Skip if it looks like a sentence (too many words)
  const wordCount = artist.split(/\s+/).length
  if (wordCount > 8) return null

  return artist
}

/**
 * Extract artist from event title and link to event
 * Creates new artist if needed, or links to existing one
 */
export async function extractAndLinkArtist(
  prisma: PrismaClient,
  eventId: string,
  eventTitle: string
): Promise<{ artistId: string; artistName: string } | null> {
  const artistName = extractArtistName(eventTitle)
  if (!artistName) return null

  const slug = slugify(artistName)
  if (!slug || slug.length < 2) return null

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

    // Link artist to event (ignore if already linked)
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
        order: 1,
      },
    })

    return { artistId: artist.id, artistName: artist.name }
  } catch {
    // Silently ignore errors (e.g., race conditions)
    return null
  }
}
