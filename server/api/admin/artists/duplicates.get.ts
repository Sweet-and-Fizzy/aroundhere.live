/**
 * Find potential duplicate artists
 * GET /api/admin/artists/duplicates
 *
 * Query params:
 *   threshold: number (0-1, default 0.8) - minimum similarity score
 *   limit: number (default 50) - max number of duplicate pairs to return
 *
 * Returns pairs of artists that might be duplicates based on name similarity
 */

import { prisma } from '../../../utils/prisma'
import { similarityScore } from '../../../scrapers/dedup'

interface DuplicatePair {
  artist1: {
    id: string
    name: string
    slug: string
    eventCount: number
    spotifyId: string | null
    spotifyMatchStatus: string
  }
  artist2: {
    id: string
    name: string
    slug: string
    eventCount: number
    spotifyId: string | null
    spotifyMatchStatus: string
  }
  similarity: number
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const threshold = Math.min(1, Math.max(0, Number(query.threshold) || 0.8))
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))

  // Get all artists with their event counts
  const artists = await prisma.artist.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      spotifyId: true,
      spotifyMatchStatus: true,
      _count: {
        select: { eventArtists: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const duplicates: DuplicatePair[] = []

  // Compare each artist with every other artist (O(n²) but necessary for fuzzy matching)
  // Optimization: only compare if first letter matches or names are short
  for (let i = 0; i < artists.length && duplicates.length < limit; i++) {
    const artist1 = artists[i]!

    for (let j = i + 1; j < artists.length && duplicates.length < limit; j++) {
      const artist2 = artists[j]!

      // Quick pre-filter: skip if names are very different lengths
      const lenDiff = Math.abs(artist1.name.length - artist2.name.length)
      const maxLen = Math.max(artist1.name.length, artist2.name.length)
      if (lenDiff > maxLen * 0.4) continue

      // Skip if both have different verified Spotify IDs (they're confirmed different)
      if (
        artist1.spotifyId &&
        artist2.spotifyId &&
        artist1.spotifyId !== artist2.spotifyId &&
        artist1.spotifyMatchStatus === 'VERIFIED' &&
        artist2.spotifyMatchStatus === 'VERIFIED'
      ) {
        continue
      }

      const similarity = similarityScore(artist1.name, artist2.name)

      if (similarity >= threshold) {
        duplicates.push({
          artist1: {
            id: artist1.id,
            name: artist1.name,
            slug: artist1.slug,
            eventCount: artist1._count.eventArtists,
            spotifyId: artist1.spotifyId,
            spotifyMatchStatus: artist1.spotifyMatchStatus,
          },
          artist2: {
            id: artist2.id,
            name: artist2.name,
            slug: artist2.slug,
            eventCount: artist2._count.eventArtists,
            spotifyId: artist2.spotifyId,
            spotifyMatchStatus: artist2.spotifyMatchStatus,
          },
          similarity,
        })
      }
    }
  }

  // Sort by similarity descending
  duplicates.sort((a, b) => b.similarity - a.similarity)

  return {
    duplicates,
    count: duplicates.length,
    threshold,
    totalArtists: artists.length,
  }
})
