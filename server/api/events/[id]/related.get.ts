/**
 * GET /api/events/:id/related
 * Returns semantically similar upcoming events using vector similarity
 */

import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 6, 20)

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Get the source event with its embedding
  const sourceEvent = await prisma.$queryRaw<Array<{
    id: string
    embedding: string | null
    venueId: string | null
  }>>`
    SELECT id, embedding::text, "venueId"
    FROM events
    WHERE id = ${id}
  `

  if (!sourceEvent || sourceEvent.length === 0 || !sourceEvent[0]) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  const { embedding, venueId } = sourceEvent[0]!

  if (!embedding) {
    // No embedding - fall back to same venue events
    const fallbackEvents = await prisma.event.findMany({
      where: {
        id: { not: id },
        venueId: venueId || undefined,
        startsAt: { gte: new Date() },
        isCancelled: false,
        isMusic: true,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        imageUrl: true,
        startsAt: true,
        coverCharge: true,
        canonicalGenres: true,
        venue: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { startsAt: 'asc' },
      take: limit + 1,
    })

    const hasMore = fallbackEvents.length > limit
    return {
      events: fallbackEvents.slice(0, limit),
      hasMore,
      method: 'venue_fallback',
    }
  }

  // Find similar events using vector similarity (cosine distance)
  // Exclude the source event, only future events, only music events
  // Using CTE to avoid Prisma parameter issues with vector type
  const relatedEvents = await prisma.$queryRawUnsafe<Array<{
    id: string
    title: string
    slug: string
    imageUrl: string | null
    startsAt: Date
    coverCharge: string | null
    canonicalGenres: string[]
    venueId: string | null
    venueName: string | null
    venueSlug: string | null
    similarity: number
  }>>(
    `WITH source AS (
      SELECT embedding FROM events WHERE id = $1
    )
    SELECT
      e.id,
      e.title,
      e.slug,
      e."imageUrl",
      e."startsAt",
      e."coverCharge",
      e."canonicalGenres",
      e."venueId",
      v.name as "venueName",
      v.slug as "venueSlug",
      1 - (e.embedding <=> source.embedding) as similarity
    FROM events e
    CROSS JOIN source
    LEFT JOIN venues v ON e."venueId" = v.id
    WHERE e.id != $1
      AND e."startsAt" >= NOW()
      AND e."isCancelled" = false
      AND e."isMusic" = true
      AND e.embedding IS NOT NULL
    ORDER BY e.embedding <=> source.embedding
    LIMIT $2`,
    id,
    limit + 1
  )

  const hasMore = relatedEvents.length > limit

  // Transform to match expected format
  const events = relatedEvents.slice(0, limit).map(e => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    imageUrl: e.imageUrl,
    startsAt: e.startsAt,
    coverCharge: e.coverCharge,
    canonicalGenres: e.canonicalGenres,
    similarity: e.similarity,
    venue: e.venueId ? {
      id: e.venueId,
      name: e.venueName,
      slug: e.venueSlug,
    } : null,
  }))

  return {
    events,
    hasMore,
    method: 'embedding_similarity',
  }
})
