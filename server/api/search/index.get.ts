import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const q = (query.q as string)?.trim()
  const regionId = query.regionId as string | undefined
  const startDate = query.startDate ? new Date(query.startDate as string) : new Date()
  const endDate = query.endDate ? new Date(query.endDate as string) : undefined
  const genres = query.genres ? (query.genres as string).split(',') : undefined
  const venueId = query.venueId as string | undefined
  const limit = Math.min(parseInt(query.limit as string) || 20, 50)

  if (!q && !genres && !venueId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Search query, genres, or venue filter required',
    })
  }

  // Build where clause for events
  const eventWhere: Prisma.EventWhereInput = {
    startsAt: {
      gte: startDate,
      ...(endDate && { lte: endDate }),
    },
    reviewStatus: { in: ['APPROVED', 'PENDING'] },
    isCancelled: false,
  }

  if (regionId) {
    eventWhere.regionId = regionId
  }

  if (venueId) {
    eventWhere.venueId = venueId
  }

  // Filter by genre at the database level
  if (genres && genres.length > 0) {
    eventWhere.canonicalGenres = { hasSome: genres.map(g => g.toLowerCase()) }
  }

  // Text search on events
  if (q) {
    eventWhere.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      {
        venue: {
          name: { contains: q, mode: 'insensitive' },
        },
      },
      {
        eventArtists: {
          some: {
            artist: {
              name: { contains: q, mode: 'insensitive' },
            },
          },
        },
      },
    ]
  }

  const events = await prisma.event.findMany({
    where: eventWhere,
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          latitude: true,
          longitude: true,
          logoUrl: true,
        },
      },
      eventArtists: {
        include: {
          artist: {
            select: {
              id: true,
              name: true,
              slug: true,
              genres: true,
              spotifyId: true,
              spotifyMatchStatus: true,
            },
          },
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
    take: limit,
  })

  // Also search artists directly if there's a text query
  const artists = q
    ? await prisma.artist.findMany({
        where: {
          name: { contains: q, mode: 'insensitive' },
        },
        take: 5,
      })
    : []

  // Search venues if there's a text query
  const venues = q
    ? await prisma.venue.findMany({
        where: {
          isActive: true,
          ...(regionId && { regionId }),
          name: { contains: q, mode: 'insensitive' },
        },
        take: 5,
      })
    : []

  return {
    events,
    artists,
    venues,
  }
})
