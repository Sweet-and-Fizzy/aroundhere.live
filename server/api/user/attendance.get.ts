/**
 * Get user's attended events
 * GET /api/user/attendance?status=GOING&upcoming=true
 * Query params:
 *   status: 'INTERESTED' | 'GOING' (optional, filter by status)
 *   upcoming: 'true' (optional, only show future events)
 */

import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import type { EventAttendanceStatus } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string
  const query = getQuery(event)
  const status = query.status as EventAttendanceStatus | undefined
  const upcoming = query.upcoming === 'true'

  // Build where clause
  const where: Prisma.EventAttendanceWhereInput = { userId }

  if (status && ['INTERESTED', 'GOING'].includes(status)) {
    where.status = status
  }

  if (upcoming) {
    where.event = {
      startsAt: { gte: new Date() },
      isCancelled: false,
    }
  }

  const records = await prisma.userEventAttendance.findMany({
    where,
    orderBy: {
      event: { startsAt: 'asc' },
    },
    select: {
      status: true,
      createdAt: true,
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          startsAt: true,
          imageUrl: true,
          isCancelled: true,
          venue: {
            select: {
              id: true,
              name: true,
              slug: true,
              city: true,
            },
          },
          eventArtists: {
            select: {
              order: true,
              artist: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
            orderBy: { order: 'asc' },
            take: 3,
          },
        },
      },
    },
  })

  return {
    events: records.map((r) => ({
      ...r.event,
      attendanceStatus: r.status,
      markedAt: r.createdAt,
    })),
  }
})
