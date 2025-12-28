/**
 * Recommendation Scoring Service
 *
 * Scores events against a user's taste profile to generate personalized recommendations.
 * Uses a combination of:
 * - Vector similarity (taste profile embedding vs event embedding)
 * - Favorite venue matching
 * - Genre overlap
 */

import { prisma } from '../../utils/prisma'

// Minimum confidence to include in recommendations
export const MIN_CONFIDENCE_THRESHOLD = 0.6

// Scoring weights - attendance-based signals get a smaller weight as a boost
const WEIGHTS = {
  embeddingSimilarity: 0.35,
  venueMatch: 0.12,
  genreOverlap: 0.20,
  eventTypeMatch: 0.15,
  // Attendance-based signals (derived from events user is interested in/going to)
  attendanceVenueMatch: 0.06,
  attendanceGenreOverlap: 0.07,
  attendanceEventTypeMatch: 0.05,
}

export interface ScoredEvent {
  event: {
    id: string
    title: string
    slug: string
    startsAt: Date
    coverCharge: string | null
    canonicalGenres: string[]
    eventType: string | null
    imageUrl: string | null
    venue: {
      id: string
      name: string
      slug: string
      city: string | null
    } | null
    artists: Array<{ name: string }>
    summary: string | null
  }
  score: number
  confidence: number
  reasons: string[]
  embeddingSimilarity: number | null
}

export interface UserProfile {
  id: string
  regionId: string | null
  tasteProfileEmbedding: number[] | null
  favoriteVenueIds: string[]
  favoriteGenres: string[]
  favoriteEventTypes: string[]
  favoriteArtistIds: string[]
  interestDescription: string | null
  attendingEventIds: string[] // Events user is interested in or going to
  // Derived from attendance - genres/venues/types the user has shown interest in
  attendanceGenres: string[]
  attendanceVenueIds: string[]
  attendanceEventTypes: string[]
}

/**
 * Get a user's profile for recommendation scoring
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const user = await prisma.$queryRaw<Array<{
    id: string
    regionId: string | null
    tasteProfileEmbedding: string | null
    interestDescription: string | null
  }>>`
    SELECT
      id,
      "regionId",
      "tasteProfileEmbedding"::text as "tasteProfileEmbedding",
      "interestDescription"
    FROM users
    WHERE id = ${userId}
  `

  if (!user[0]) {
    return null
  }

  // Get favorite venue IDs
  const favoriteVenues = await prisma.userFavoriteVenue.findMany({
    where: { userId },
    select: { venueId: true },
  })

  // Get favorite genres
  const favoriteGenres = await prisma.userFavoriteGenre.findMany({
    where: { userId },
    select: { genre: true },
  })

  // Get favorite event types
  const favoriteEventTypes = await prisma.userFavoriteEventType.findMany({
    where: { userId },
    select: { eventType: true },
  })

  // Get favorite artist IDs
  const favoriteArtists = await prisma.userFavoriteArtist.findMany({
    where: { userId },
    select: { artistId: true },
  })

  // Get events user is attending (interested or going) with event details for signals
  const attendingEvents = await prisma.userEventAttendance.findMany({
    where: {
      userId,
      event: {
        startsAt: { gte: new Date() }, // Only future events
        isCancelled: false,
      },
    },
    select: {
      eventId: true,
      status: true,
      event: {
        select: {
          canonicalGenres: true,
          venueId: true,
          eventType: true,
        },
      },
    },
  })

  // Extract characteristics from attended events (weight "GOING" higher)
  const attendanceGenres = new Set<string>()
  const attendanceVenueIds = new Set<string>()
  const attendanceEventTypes = new Set<string>()

  for (const a of attendingEvents) {
    // Add genres from attended events
    for (const genre of a.event.canonicalGenres) {
      attendanceGenres.add(genre)
    }
    // Add venue from attended events
    if (a.event.venueId) {
      attendanceVenueIds.add(a.event.venueId)
    }
    // Add event type from attended events
    if (a.event.eventType) {
      attendanceEventTypes.add(a.event.eventType)
    }
  }

  // Parse the embedding
  let embedding: number[] | null = null
  if (user[0].tasteProfileEmbedding) {
    try {
      embedding = JSON.parse(user[0].tasteProfileEmbedding)
    } catch {
      embedding = null
    }
  }

  return {
    id: userId,
    regionId: user[0].regionId,
    tasteProfileEmbedding: embedding,
    favoriteVenueIds: favoriteVenues.map((v) => v.venueId),
    favoriteGenres: favoriteGenres.map((g) => g.genre),
    favoriteEventTypes: favoriteEventTypes.map((t) => t.eventType),
    favoriteArtistIds: favoriteArtists.map((a) => a.artistId),
    interestDescription: user[0].interestDescription,
    attendingEventIds: attendingEvents.map((a) => a.eventId),
    // Derived signals from attendance
    attendanceGenres: Array.from(attendanceGenres),
    attendanceVenueIds: Array.from(attendanceVenueIds),
    attendanceEventTypes: Array.from(attendanceEventTypes),
  }
}

/**
 * Find candidate events for recommendations
 */
export async function findCandidateEvents(
  startDate: Date,
  endDate: Date,
  excludeEventIds: string[] = [],
  limit = 50,
  regionId?: string | null
): Promise<ScoredEvent['event'][]> {
  // First, get event IDs that have embeddings (vector type can't be filtered in Prisma)
  // Use separate queries based on filters to keep SQL simple
  let eventsWithEmbeddings: Array<{ id: string }>

  if (regionId && excludeEventIds.length > 0) {
    eventsWithEmbeddings = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM events
      WHERE "startsAt" >= ${startDate}
        AND "startsAt" <= ${endDate}
        AND "regionId" = ${regionId}
        AND "isCancelled" = false
        AND "isMusic" = true
        AND embedding IS NOT NULL
        AND id != ALL(${excludeEventIds})
      ORDER BY "startsAt" ASC
      LIMIT ${limit}
    `
  } else if (regionId) {
    eventsWithEmbeddings = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM events
      WHERE "startsAt" >= ${startDate}
        AND "startsAt" <= ${endDate}
        AND "regionId" = ${regionId}
        AND "isCancelled" = false
        AND "isMusic" = true
        AND embedding IS NOT NULL
      ORDER BY "startsAt" ASC
      LIMIT ${limit}
    `
  } else if (excludeEventIds.length > 0) {
    eventsWithEmbeddings = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM events
      WHERE "startsAt" >= ${startDate}
        AND "startsAt" <= ${endDate}
        AND "isCancelled" = false
        AND "isMusic" = true
        AND embedding IS NOT NULL
        AND id != ALL(${excludeEventIds})
      ORDER BY "startsAt" ASC
      LIMIT ${limit}
    `
  } else {
    eventsWithEmbeddings = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM events
      WHERE "startsAt" >= ${startDate}
        AND "startsAt" <= ${endDate}
        AND "isCancelled" = false
        AND "isMusic" = true
        AND embedding IS NOT NULL
      ORDER BY "startsAt" ASC
      LIMIT ${limit}
    `
  }

  if (eventsWithEmbeddings.length === 0) {
    return []
  }

  const eventIds = eventsWithEmbeddings.map((e) => e.id)

  // Then fetch full event details with relations
  const events = await prisma.event.findMany({
    where: {
      id: { in: eventIds },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      coverCharge: true,
      canonicalGenres: true,
      eventType: true,
      summary: true,
      imageUrl: true,
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
          artist: {
            select: { name: true },
          },
        },
        orderBy: { order: 'asc' },
        take: 3,
      },
    },
    orderBy: { startsAt: 'asc' },
  })

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    startsAt: e.startsAt,
    coverCharge: e.coverCharge,
    canonicalGenres: e.canonicalGenres,
    eventType: e.eventType,
    summary: e.summary,
    imageUrl: e.imageUrl,
    venue: e.venue,
    artists: e.eventArtists.map((ea) => ({ name: ea.artist.name })),
  }))
}

/**
 * Score events against a user's taste profile using vector similarity
 */
export async function scoreEventsForUser(
  events: ScoredEvent['event'][],
  userProfile: UserProfile
): Promise<ScoredEvent[]> {
  if (events.length === 0) {
    return []
  }

  // If user has no taste profile, use fallback scoring
  if (!userProfile.tasteProfileEmbedding) {
    return events.map((event) => scoreEventWithoutEmbedding(event, userProfile))
  }

  // Get event embeddings and similarities in one query
  const eventIds = events.map((e) => e.id)
  const embeddingSimilarities = await prisma.$queryRaw<Array<{
    id: string
    similarity: number
  }>>`
    WITH user_profile AS (
      SELECT "tasteProfileEmbedding" as embedding
      FROM users
      WHERE id = ${userProfile.id}
    )
    SELECT
      e.id,
      1 - (e.embedding <=> up.embedding) as similarity
    FROM events e
    CROSS JOIN user_profile up
    WHERE e.id = ANY(${eventIds})
      AND e.embedding IS NOT NULL
  `

  const similarityMap = new Map(
    embeddingSimilarities.map((s) => [s.id, s.similarity])
  )

  return events.map((event) => {
    const embeddingSimilarity = similarityMap.get(event.id) ?? null
    return scoreEvent(event, userProfile, embeddingSimilarity)
  })
}

/**
 * Score a single event with embedding similarity
 */
function scoreEvent(
  event: ScoredEvent['event'],
  userProfile: UserProfile,
  embeddingSimilarity: number | null
): ScoredEvent {
  const reasons: string[] = []
  let totalScore = 0
  let totalWeight = 0

  // Embedding similarity (if available)
  if (embeddingSimilarity !== null) {
    // Normalize from [-1, 1] to [0, 1] range (cosine similarity is already 0-1 for our use)
    const normalizedSimilarity = Math.max(0, Math.min(1, embeddingSimilarity))
    totalScore += normalizedSimilarity * WEIGHTS.embeddingSimilarity
    totalWeight += WEIGHTS.embeddingSimilarity

    if (normalizedSimilarity > 0.5) {
      reasons.push('Matches your taste profile')
    }
  }

  // Venue match
  if (event.venue && userProfile.favoriteVenueIds.includes(event.venue.id)) {
    totalScore += 1.0 * WEIGHTS.venueMatch
    totalWeight += WEIGHTS.venueMatch
    reasons.push(`At ${event.venue.name}, a favorite venue`)
  } else {
    totalWeight += WEIGHTS.venueMatch
    // No score added for non-match
  }

  // Genre overlap
  const overlappingGenres = event.canonicalGenres.filter((g) =>
    userProfile.favoriteGenres.includes(g)
  )
  if (overlappingGenres.length > 0) {
    const genreScore = Math.min(1, overlappingGenres.length / 2) // 2+ matches = full score
    totalScore += genreScore * WEIGHTS.genreOverlap
    totalWeight += WEIGHTS.genreOverlap
    reasons.push(`${overlappingGenres.join(', ')} music`)
  } else {
    totalWeight += WEIGHTS.genreOverlap
  }

  // Event type match
  const eventTypeMatch = event.eventType && userProfile.favoriteEventTypes.includes(event.eventType)
  if (eventTypeMatch) {
    totalScore += 1.0 * WEIGHTS.eventTypeMatch
    totalWeight += WEIGHTS.eventTypeMatch
    // Human-readable event type names
    const eventTypeLabels: Record<string, string> = {
      'MUSIC': 'Live Music',
      'DJ': 'DJ',
      'OPEN_MIC': 'Open Mic',
      'COMEDY': 'Comedy',
      'THEATER': 'Theater',
      'DANCE': 'Dance',
      'KARAOKE': 'Karaoke',
      'TRIVIA': 'Trivia',
    }
    const label = eventTypeLabels[event.eventType] || event.eventType
    reasons.push(`${label} event`)
  } else {
    totalWeight += WEIGHTS.eventTypeMatch
  }

  // Attendance-based signals (boost from events user is interested in/going to)
  // These are secondary signals that add a boost when matched

  // Attendance venue match - event is at a venue where user is attending another event
  const attendanceVenueMatch = event.venue && userProfile.attendanceVenueIds.includes(event.venue.id)
  if (attendanceVenueMatch) {
    totalScore += 1.0 * WEIGHTS.attendanceVenueMatch
    totalWeight += WEIGHTS.attendanceVenueMatch
    // Don't add to reasons - this is a subtle boost
  } else {
    totalWeight += WEIGHTS.attendanceVenueMatch
  }

  // Attendance genre overlap - event has genres the user is attending events for
  const attendanceGenreOverlap = event.canonicalGenres.filter((g) =>
    userProfile.attendanceGenres.includes(g)
  )
  if (attendanceGenreOverlap.length > 0) {
    const genreScore = Math.min(1, attendanceGenreOverlap.length / 2)
    totalScore += genreScore * WEIGHTS.attendanceGenreOverlap
    totalWeight += WEIGHTS.attendanceGenreOverlap
    // Only add to reasons if not already covered by favorite genres
    if (overlappingGenres.length === 0 && attendanceGenreOverlap.length > 0) {
      reasons.push(`Similar to events you're attending`)
    }
  } else {
    totalWeight += WEIGHTS.attendanceGenreOverlap
  }

  // Attendance event type match - same type as events user is attending
  const attendanceEventTypeMatch = event.eventType && userProfile.attendanceEventTypes.includes(event.eventType)
  if (attendanceEventTypeMatch) {
    totalScore += 1.0 * WEIGHTS.attendanceEventTypeMatch
    totalWeight += WEIGHTS.attendanceEventTypeMatch
  } else {
    totalWeight += WEIGHTS.attendanceEventTypeMatch
  }

  // Calculate final score
  const score = totalWeight > 0 ? totalScore / totalWeight : 0

  // Confidence is based on how many signals we have (including attendance signals)
  const signalCount = [
    embeddingSimilarity !== null,
    event.venue && userProfile.favoriteVenueIds.includes(event.venue.id),
    overlappingGenres.length > 0,
    eventTypeMatch,
    attendanceVenueMatch,
    attendanceGenreOverlap.length > 0,
    attendanceEventTypeMatch,
  ].filter(Boolean).length

  const confidence = Math.min(1, signalCount * 0.15 + score * 0.5)

  return {
    event,
    score,
    confidence,
    reasons,
    embeddingSimilarity,
  }
}

/**
 * Score event without embedding (fallback)
 */
function scoreEventWithoutEmbedding(
  event: ScoredEvent['event'],
  userProfile: UserProfile
): ScoredEvent {
  const reasons: string[] = []
  let score = 0
  let signalCount = 0

  // Venue match
  if (event.venue && userProfile.favoriteVenueIds.includes(event.venue.id)) {
    score += 0.25
    reasons.push(`At ${event.venue.name}, a favorite venue`)
    signalCount++
  }

  // Genre overlap
  const overlappingGenres = event.canonicalGenres.filter((g) =>
    userProfile.favoriteGenres.includes(g)
  )
  if (overlappingGenres.length > 0) {
    score += Math.min(0.35, overlappingGenres.length * 0.12)
    reasons.push(`${overlappingGenres.join(', ')} music`)
    signalCount++
  }

  // Event type match
  if (event.eventType && userProfile.favoriteEventTypes.includes(event.eventType)) {
    score += 0.25
    const eventTypeLabels: Record<string, string> = {
      'MUSIC': 'Live Music',
      'DJ': 'DJ',
      'OPEN_MIC': 'Open Mic',
      'COMEDY': 'Comedy',
      'THEATER': 'Theater',
      'DANCE': 'Dance',
      'KARAOKE': 'Karaoke',
      'TRIVIA': 'Trivia',
    }
    const label = eventTypeLabels[event.eventType] || event.eventType
    reasons.push(`${label} event`)
    signalCount++
  }

  // Attendance-based signals (boost from events user is interested in/going to)
  // Attendance venue match
  if (event.venue && userProfile.attendanceVenueIds.includes(event.venue.id)) {
    score += 0.05
    signalCount++
  }

  // Attendance genre overlap
  const attendanceGenreOverlap = event.canonicalGenres.filter((g) =>
    userProfile.attendanceGenres.includes(g)
  )
  if (attendanceGenreOverlap.length > 0) {
    score += Math.min(0.08, attendanceGenreOverlap.length * 0.04)
    if (overlappingGenres.length === 0) {
      reasons.push(`Similar to events you're attending`)
    }
    signalCount++
  }

  // Attendance event type match
  if (event.eventType && userProfile.attendanceEventTypes.includes(event.eventType)) {
    score += 0.05
    signalCount++
  }

  const confidence = Math.min(1, signalCount * 0.15 + score * 0.4)

  return {
    event,
    score,
    confidence,
    reasons,
    embeddingSimilarity: null,
  }
}

/**
 * Rank and filter recommendations
 */
export function rankRecommendations(
  scoredEvents: ScoredEvent[],
  minConfidence = MIN_CONFIDENCE_THRESHOLD,
  maxResults = 10
): ScoredEvent[] {
  return scoredEvents
    .filter((e) => e.confidence >= minConfidence)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}

/**
 * Find events featuring favorite artists (deterministic section)
 */
export async function findFavoriteArtistEvents(
  userId: string,
  startDate: Date,
  endDate: Date,
  regionId?: string | null
): Promise<{
  event: ScoredEvent['event']
  matchedArtists: string[]
}[]> {
  // Get user's favorite artist IDs
  const favorites = await prisma.userFavoriteArtist.findMany({
    where: { userId },
    select: {
      artistId: true,
      artist: { select: { name: true } },
    },
  })

  if (favorites.length === 0) {
    return []
  }

  const favoriteArtistIds = favorites.map((f) => f.artistId)
  const artistNameMap = new Map(favorites.map((f) => [f.artistId, f.artist.name]))

  // Build where clause with optional region filter
  const whereClause: Record<string, unknown> = {
    startsAt: {
      gte: startDate,
      lte: endDate,
    },
    isCancelled: false,
    isMusic: true,
    eventArtists: {
      some: {
        artistId: { in: favoriteArtistIds },
      },
    },
  }

  if (regionId) {
    whereClause.regionId = regionId
  }

  // Find events with these artists
  const events = await prisma.event.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      coverCharge: true,
      canonicalGenres: true,
      eventType: true,
      summary: true,
      imageUrl: true,
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
          artistId: true,
          artist: {
            select: { name: true },
          },
        },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { startsAt: 'asc' },
  })

  return events.map((e) => {
    const matchedArtistIds = e.eventArtists
      .filter((ea) => favoriteArtistIds.includes(ea.artistId))
      .map((ea) => ea.artistId)

    return {
      event: {
        id: e.id,
        title: e.title,
        slug: e.slug,
        startsAt: e.startsAt,
        coverCharge: e.coverCharge,
        canonicalGenres: e.canonicalGenres,
        eventType: e.eventType,
        summary: e.summary,
        imageUrl: e.imageUrl,
        venue: e.venue,
        artists: e.eventArtists.slice(0, 3).map((ea) => ({ name: ea.artist.name })),
      },
      matchedArtists: matchedArtistIds
        .map((id) => artistNameMap.get(id))
        .filter((name): name is string => !!name),
    }
  })
}
