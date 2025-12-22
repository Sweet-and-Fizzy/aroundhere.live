/**
 * Search artists by name
 * GET /api/artists/search?q=query&limit=10
 *
 * Used for autocomplete when adding artists to events
 */

import { prisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = (query.q as string || '').trim()
  const limit = Math.min(parseInt(query.limit as string) || 10, 50)

  if (!q || q.length < 2) {
    return { artists: [] }
  }

  // Search by name (case-insensitive contains)
  const artists = await prisma.artist.findMany({
    where: {
      name: {
        contains: q,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      genres: true,
      isLocal: true,
      spotifyId: true,
      spotifyName: true,
      spotifyMatchStatus: true,
      _count: {
        select: {
          eventArtists: true,
        },
      },
    },
    orderBy: [
      // Prioritize verified/matched artists
      { spotifyMatchStatus: 'asc' },
      // Then by name
      { name: 'asc' },
    ],
    take: limit,
  })

  return {
    artists: artists.map(a => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      genres: a.genres,
      isLocal: a.isLocal,
      spotifyId: a.spotifyId,
      spotifyName: a.spotifyName,
      spotifyMatchStatus: a.spotifyMatchStatus,
      eventCount: a._count.eventArtists,
    })),
  }
})
