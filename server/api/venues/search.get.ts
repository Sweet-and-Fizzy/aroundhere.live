/**
 * Search venues by name
 * GET /api/venues/search?q=query&limit=10
 *
 * Used for autocomplete when adding venues to favorites
 */

import { prisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = (query.q as string || '').trim()
  const limit = Math.min(parseInt(query.limit as string) || 10, 50)

  if (!q || q.length < 2) {
    return { venues: [] }
  }

  // Search by name (case-insensitive contains)
  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      name: {
        contains: q,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      state: true,
      venueType: true,
      _count: {
        select: {
          events: {
            where: {
              startsAt: { gte: new Date() },
            },
          },
        },
      },
    },
    orderBy: [
      { name: 'asc' },
    ],
    take: limit,
  })

  return {
    venues: venues.map(v => ({
      id: v.id,
      name: v.name,
      slug: v.slug,
      city: v.city,
      state: v.state,
      venueType: v.venueType,
      upcomingEventCount: v._count.events,
    })),
  }
})
