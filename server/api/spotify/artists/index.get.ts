/**
 * List artists with Spotify matching info
 * GET /api/spotify/artists
 *
 * Query params:
 *   status: SpotifyMatchStatus (PENDING, AUTO_MATCHED, NEEDS_REVIEW, VERIFIED, NO_MATCH)
 *   search: string - filter by name (case-insensitive)
 *   limit: number (default 50)
 *   offset: number (default 0)
 */

import { prisma } from '../../../utils/prisma'
import type { SpotifyMatchStatus } from '@prisma/client'

const VALID_STATUSES: SpotifyMatchStatus[] = [
  'PENDING',
  'AUTO_MATCHED',
  'NEEDS_REVIEW',
  'VERIFIED',
  'NO_MATCH',
]

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const status = query.status as SpotifyMatchStatus | undefined
  const search = (query.search as string || '').trim()
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  // Validate status if provided
  if (status && !VALID_STATUSES.includes(status)) {
    throw createError({
      statusCode: 400,
      message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
    })
  }

  const where: any = {}
  if (status) {
    where.spotifyMatchStatus = status
  }
  if (search) {
    where.name = {
      contains: search,
      mode: 'insensitive',
    }
  }

  const [artists, total] = await Promise.all([
    prisma.artist.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        spotifyId: true,
        spotifyName: true,
        spotifyMatchConfidence: true,
        spotifyMatchStatus: true,
        spotifyPopularTracks: true,
        spotifyTracksUpdatedAt: true,
        _count: {
          select: {
            eventArtists: true,
          },
        },
        eventArtists: {
          select: {
            event: {
              select: {
                id: true,
                title: true,
                slug: true,
                startsAt: true,
              },
            },
          },
          where: {
            event: {
              startsAt: {
                gte: new Date(),
              },
            },
          },
          orderBy: {
            event: {
              startsAt: 'asc',
            },
          },
          take: 1,
        },
      },
      orderBy: [
        { spotifyMatchStatus: 'asc' },
        { name: 'asc' },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.artist.count({ where }),
  ])

  return {
    artists: artists.map((a) => ({
      ...a,
      eventCount: a._count.eventArtists,
      nextEvent: a.eventArtists[0]?.event || null,
      _count: undefined,
      eventArtists: undefined,
    })),
    total,
    limit,
    offset,
  }
})
