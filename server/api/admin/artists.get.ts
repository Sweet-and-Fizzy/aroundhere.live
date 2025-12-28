/**
 * List artists for admin management
 * GET /api/admin/artists?q=search&page=1&limit=50&sort=name&order=asc
 */

import { Prisma, MusicBrainzMatchStatus } from '@prisma/client'
import { prisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = (query.q as string || '').trim()
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 50))
  const sort = (query.sort as string) || 'eventCount'
  const order = (query.order as string) === 'asc' ? 'asc' : 'desc'
  const musicbrainzStatus = query.musicbrainzStatus as string | undefined
  const skip = (page - 1) * limit

  // Build where clause
  const where: Prisma.ArtistWhereInput = {}
  if (q) {
    where.name = {
      contains: q,
      mode: 'insensitive',
    }
  }
  if (musicbrainzStatus) {
    where.musicbrainzMatchStatus = musicbrainzStatus as MusicBrainzMatchStatus
  }

  // Get total count
  const total = await prisma.artist.count({ where })

  // Build orderBy
  let orderBy: Prisma.ArtistOrderByWithRelationInput = { name: 'asc' }
  if (sort === 'name') {
    orderBy = { name: order }
  } else if (sort === 'createdAt') {
    orderBy = { createdAt: order }
  } else if (sort === 'eventCount') {
    // For event count, we'll sort after fetching
    orderBy = { name: 'asc' }
  }

  // Get artists with their recent events
  const artists = await prisma.artist.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      genres: true,
      isLocal: true,
      spotifyId: true,
      spotifyName: true,
      spotifyMatchStatus: true,
      musicbrainzId: true,
      musicbrainzMatchStatus: true,
      musicbrainzMatchConfidence: true,
      musicbrainzTags: true,
      musicbrainzDescription: true,
      createdAt: true,
      _count: {
        select: {
          eventArtists: true,
          favoritedBy: true,
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
              venue: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          event: {
            startsAt: 'desc',
          },
        },
        take: 3, // Get up to 3 recent events
      },
    },
    orderBy,
    skip,
    take: limit,
  })

  // If sorting by event count, do it in memory
  let sortedArtists = artists
  if (sort === 'eventCount') {
    sortedArtists = [...artists].sort((a, b) => {
      const diff = a._count.eventArtists - b._count.eventArtists
      return order === 'asc' ? diff : -diff
    })
  }

  return {
    artists: sortedArtists.map(a => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      genres: a.genres,
      isLocal: a.isLocal,
      spotifyId: a.spotifyId,
      spotifyName: a.spotifyName,
      spotifyMatchStatus: a.spotifyMatchStatus,
      musicbrainzId: a.musicbrainzId,
      musicbrainzMatchStatus: a.musicbrainzMatchStatus,
      musicbrainzMatchConfidence: a.musicbrainzMatchConfidence,
      musicbrainzTags: a.musicbrainzTags,
      musicbrainzDescription: a.musicbrainzDescription,
      createdAt: a.createdAt,
      eventCount: a._count.eventArtists,
      favoriteCount: a._count.favoritedBy,
      recentEvents: a.eventArtists.map(ea => ({
        id: ea.event.id,
        title: ea.event.title,
        slug: ea.event.slug,
        startsAt: ea.event.startsAt,
        venueName: ea.event.venue?.name || null,
      })),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
})
