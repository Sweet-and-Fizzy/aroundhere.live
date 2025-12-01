/**
 * Get recent agent sessions
 * GET /api/agent/sessions
 */

import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = parseInt(query.limit as string) || 10

  const sessions = await prisma.agentSession.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      url: true,
      sessionType: true,
      status: true,
      llmProvider: true,
      llmModel: true,
      currentIteration: true,
      maxIterations: true,
      completenessScore: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
      venueData: true,
      eventData: true,
      venueId: true,
    },
  })

  // Fetch venue info for sessions that have venueId (just name/website for retry)
  const venueIds = sessions.map(s => s.venueId).filter(Boolean) as string[]
  const venues = venueIds.length > 0
    ? await prisma.venue.findMany({
        where: { id: { in: venueIds } },
        select: { id: true, name: true, website: true },
      })
    : []
  const venueMap = new Map(venues.map(v => [v.id, v]))

  return {
    sessions: sessions.map(s => ({
      ...s,
      eventCount: Array.isArray(s.eventData) ? s.eventData.length : 0,
      venue: s.venueId ? venueMap.get(s.venueId) : null,
    })),
  }
})
