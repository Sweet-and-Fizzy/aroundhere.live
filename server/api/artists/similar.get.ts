/**
 * Find similar artists by name (for duplicate detection)
 * GET /api/artists/similar
 *
 * Query params:
 *   name: string (required) - artist name to check
 *   threshold: number (0-1, default 0.7) - minimum similarity score
 *   limit: number (default 5) - max results
 *
 * Returns artists with similar names, useful for duplicate prevention during creation
 */

import { prisma } from '../../utils/prisma'
import { similarityScore } from '../../scrapers/dedup'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const name = (query.name as string || '').trim()

  if (!name || name.length < 2) {
    throw createError({
      statusCode: 400,
      message: 'Name parameter is required (minimum 2 characters)',
    })
  }

  const threshold = Math.min(1, Math.max(0, Number(query.threshold) || 0.7))
  const limit = Math.min(20, Math.max(1, Number(query.limit) || 5))

  // Get artists that might be similar
  // First, do a quick filter using database ILIKE for performance
  const nameLower = name.toLowerCase()
  const firstChars = nameLower.substring(0, 3)

  // Get candidates: exact prefix match, or contains the name, or name contains them
  const candidates = await prisma.artist.findMany({
    where: {
      OR: [
        // Starts with same characters
        { name: { startsWith: firstChars, mode: 'insensitive' } },
        // Contains the search term
        { name: { contains: name, mode: 'insensitive' } },
        // Search term contains the artist name (for short names)
        ...(name.length > 5
          ? [{ name: { endsWith: nameLower.substring(nameLower.length - 3), mode: 'insensitive' as const } }]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      spotifyId: true,
      spotifyName: true,
      spotifyMatchStatus: true,
      _count: {
        select: { eventArtists: true },
      },
    },
    take: 100, // Get more candidates, then filter by similarity
  })

  // Calculate similarity scores
  const similarArtists = candidates
    .map((artist) => ({
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
      spotifyId: artist.spotifyId,
      spotifyName: artist.spotifyName,
      spotifyMatchStatus: artist.spotifyMatchStatus,
      eventCount: artist._count.eventArtists,
      similarity: similarityScore(name, artist.name),
    }))
    .filter((a) => a.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  return {
    query: name,
    similar: similarArtists,
    hasPotentialDuplicates: similarArtists.some((a) => a.similarity >= 0.85),
  }
})
