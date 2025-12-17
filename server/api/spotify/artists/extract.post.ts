/**
 * Extract artists from existing event titles
 * POST /api/spotify/artists/extract
 *
 * Body: { limit?: number, dryRun?: boolean }
 *
 * This is a one-time backfill operation for existing events
 */

import { prisma } from '../../../utils/prisma'
import { extractArtistName } from '../../../utils/artist-extraction'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const limit = body.limit || 500
  const dryRun = body.dryRun || false

  // Get events without artists linked
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { isMusic: true },
        { isMusic: null },
      ],
      eventArtists: {
        none: {},
      },
    },
    select: {
      id: true,
      title: true,
    },
    orderBy: { title: 'asc' },
    take: limit,
  })

  // Extract artists
  const artistMap = new Map<string, { name: string; slug: string; eventIds: string[] }>()
  let skipped = 0

  for (const evt of events) {
    const artistName = extractArtistName(evt.title)
    if (!artistName) {
      skipped++
      continue
    }

    const slug = slugify(artistName)
    if (!slug || slug.length < 2) {
      skipped++
      continue
    }

    if (artistMap.has(slug)) {
      artistMap.get(slug)!.eventIds.push(evt.id)
    } else {
      artistMap.set(slug, {
        name: artistName,
        slug,
        eventIds: [evt.id],
      })
    }
  }

  const extracted = Array.from(artistMap.values())

  if (dryRun) {
    return {
      dryRun: true,
      eventsScanned: events.length,
      skipped,
      artistsFound: extracted.length,
      artists: extracted.map(a => ({ name: a.name, eventCount: a.eventIds.length })),
    }
  }

  // Create artists and link to events
  let created = 0
  let linked = 0
  let resetFromNoMatch = 0

  for (const extracted of artistMap.values()) {
    // Find or create artist
    let artist = await prisma.artist.findUnique({
      where: { slug: extracted.slug },
    })

    if (!artist) {
      artist = await prisma.artist.create({
        data: {
          name: extracted.name,
          slug: extracted.slug,
          spotifyMatchStatus: 'PENDING',
        },
      })
      created++
    } else if (artist.spotifyMatchStatus === 'NO_MATCH') {
      // If artist was marked NO_MATCH but appears at a new event,
      // reset to PENDING to try matching again (they might have joined Spotify)
      artist = await prisma.artist.update({
        where: { id: artist.id },
        data: { spotifyMatchStatus: 'PENDING' },
      })
      resetFromNoMatch++
    }

    // Link to events
    for (const eventId of extracted.eventIds) {
      try {
        await prisma.eventArtist.create({
          data: {
            eventId,
            artistId: artist.id,
            order: 1,
          },
        })
        linked++
      } catch {
        // Already linked, skip
      }
    }
  }

  return {
    dryRun: false,
    eventsScanned: events.length,
    skipped,
    artistsCreated: created,
    artistsResetFromNoMatch: resetFromNoMatch,
    eventsLinked: linked,
  }
})
