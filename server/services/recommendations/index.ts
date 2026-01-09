/**
 * Recommendation Scoring Service
 *
 * Scores events against a user's taste profile to generate personalized recommendations.
 *
 * ## Algorithm Overview
 *
 * Events are scored using a weighted combination of signals:
 *
 * ### Primary Signals (user's explicit preferences)
 *
 * - **Artist Match (25%)**: Events featuring the user's favorite artists get
 *   the strongest signal. This is the most direct indicator of interest.
 *
 * - **Embedding Similarity (25%)**: Cosine similarity between user's taste profile
 *   embedding and event embedding. The taste profile is built from:
 *   - Favorite artists (50% weight) - averaged artist profile embeddings
 *   - Favorite genres + event types (30% weight) - converted to descriptive text
 *   - Interest description (20% weight) - free-form text
 *   This captures semantic similarity - e.g., if you like funk, you'll match
 *   events with similar vibes even if genres don't exactly match.
 *
 * - **Genre Overlap (18%)**: Direct match between event's canonical genres and
 *   user's favorite genres. 2+ matches = full score. This is explicit matching,
 *   separate from the embedding similarity.
 *
 * - **Event Type Match (12%)**: Events matching favorite event types (Music, DJ,
 *   Comedy, Open Mic, etc.) get a boost.
 *
 * - **Venue Match (10%)**: Events at user's favorite venues score higher.
 *
 * ### Secondary Signals (inferred from behavior)
 *
 * - **Attendance Genre Overlap (5%)**: Events with genres similar to events the
 *   user is attending/interested in.
 * - **Attendance Venue Match (3%)**: Events at venues where user is attending
 *   other events.
 * - **Attendance Event Type Match (2%)**: Same event type as events user is
 *   attending.
 *
 * ## Why Both Embedding AND Explicit Matching?
 *
 * The embedding captures "vibe" - semantic similarity that goes beyond exact genre
 * labels. An event might not be tagged as "funk" but could have a funky feel that
 * matches your taste profile. The explicit genre/venue/type matching ensures we
 * don't miss obvious matches and gives users predictable results based on their
 * stated preferences.
 *
 * ## Scoring Process
 *
 * 1. **Candidate Selection**: All events in the date range with embeddings are
 *    fetched (no early limiting to avoid missing good matches later in the range).
 *
 * 2. **Scoring**: Each event is scored against the user profile. The final score
 *    is a weighted average of all signal scores.
 *
 * 3. **Confidence**: Calculated from number of matching signals + overall score.
 *    Events below the confidence threshold (0.4 for chat, 0.6 default) are filtered.
 *
 * 4. **Ranking**: Events are sorted by score and top N returned.
 *
 * ## Reason Display
 *
 * Each recommendation includes human-readable reasons explaining why it was
 * recommended. Reasons are sorted by their weight so the most impactful reason
 * appears first (e.g., "funk music · At Stone Church, a favorite venue").
 */

import { prisma } from '../../utils/prisma'

// Minimum confidence to include in recommendations
export const MIN_CONFIDENCE_THRESHOLD = 0.6

// Scoring weights - sum to 1.0 for weighted average
// Primary signals (explicit user preferences)
const WEIGHTS = {
  artistMatch: 0.25,          // Favorite artist performing (strongest signal)
  embeddingSimilarity: 0.25,  // Taste profile match
  genreOverlap: 0.18,         // Favorite genres
  eventTypeMatch: 0.12,       // Favorite event types
  venueMatch: 0.10,           // Favorite venues
  // Secondary signals (inferred from attendance behavior)
  attendanceGenreOverlap: 0.05,
  attendanceVenueMatch: 0.03,
  attendanceEventTypeMatch: 0.02,
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
    artists: Array<{ id: string; name: string }>
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
 * Note: We fetch ALL events in the date range (no limit) to ensure
 * we don't miss good matches that happen later in the period.
 * Scoring will determine which events are best.
 */
export async function findCandidateEvents(
  startDate: Date,
  endDate: Date,
  excludeEventIds: string[] = [],
  _limit = 50, // Not used - we fetch all candidates and let scoring filter
  regionId?: string | null
): Promise<ScoredEvent['event'][]> {
  // First, get event IDs that have embeddings (vector type can't be filtered in Prisma)
  // Use separate queries based on filters to keep SQL simple
  // We don't limit here - get all events in range and let scoring determine best matches
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
          region: { select: { timezone: true } },
        },
      },
      eventArtists: {
        select: {
          artist: {
            select: { id: true, name: true },
          },
        },
        orderBy: { order: 'asc' },
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
    artists: e.eventArtists.map((ea) => ({ id: ea.artist.id, name: ea.artist.name })),
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
  // Collect reasons with their weights so we can sort by importance
  const reasonsWithWeight: Array<{ reason: string; weight: number }> = []
  let totalScore = 0
  let totalWeight = 0

  // Favorite artist match (strongest signal)
  const matchedArtists = event.artists.filter((a) =>
    userProfile.favoriteArtistIds.includes(a.id)
  )
  if (matchedArtists.length > 0) {
    totalScore += 1.0 * WEIGHTS.artistMatch
    totalWeight += WEIGHTS.artistMatch
    const artistNames = matchedArtists.map((a) => a.name).join(', ')
    reasonsWithWeight.push({
      reason: matchedArtists.length === 1
        ? `Features ${artistNames}, an artist you follow`
        : `Features ${artistNames}`,
      weight: WEIGHTS.artistMatch,
    })
  } else {
    totalWeight += WEIGHTS.artistMatch
  }

  // Embedding similarity (if available)
  if (embeddingSimilarity !== null) {
    // Normalize from [-1, 1] to [0, 1] range (cosine similarity is already 0-1 for our use)
    const normalizedSimilarity = Math.max(0, Math.min(1, embeddingSimilarity))
    totalScore += normalizedSimilarity * WEIGHTS.embeddingSimilarity
    totalWeight += WEIGHTS.embeddingSimilarity

    if (normalizedSimilarity > 0.5) {
      reasonsWithWeight.push({ reason: 'Matches your taste profile', weight: WEIGHTS.embeddingSimilarity })
    }
  }

  // Venue match
  if (event.venue && userProfile.favoriteVenueIds.includes(event.venue.id)) {
    totalScore += 1.0 * WEIGHTS.venueMatch
    totalWeight += WEIGHTS.venueMatch
    reasonsWithWeight.push({ reason: `At ${event.venue.name}, a favorite venue`, weight: WEIGHTS.venueMatch })
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
    reasonsWithWeight.push({ reason: `${overlappingGenres.join(', ')} music`, weight: WEIGHTS.genreOverlap })
  } else {
    totalWeight += WEIGHTS.genreOverlap
  }

  // Event type match
  const eventTypeMatch = event.eventType && userProfile.favoriteEventTypes.includes(event.eventType)
  if (eventTypeMatch && event.eventType) {
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
    reasonsWithWeight.push({ reason: `${label} event`, weight: WEIGHTS.eventTypeMatch })
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
      reasonsWithWeight.push({ reason: 'Similar to events you\'re attending', weight: WEIGHTS.attendanceGenreOverlap })
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

  // Sort reasons by weight (highest first) and extract just the reason strings
  const reasons = reasonsWithWeight
    .sort((a, b) => b.weight - a.weight)
    .map(r => r.reason)

  // Calculate final score
  const score = totalWeight > 0 ? totalScore / totalWeight : 0

  // Confidence is based on how many signals we have (including attendance signals)
  const signalCount = [
    matchedArtists.length > 0,
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
  // Collect reasons with their score contribution so we can sort by importance
  const reasonsWithScore: Array<{ reason: string; scoreContrib: number }> = []
  let score = 0
  let signalCount = 0

  // Favorite artist match (strongest signal - 0.40)
  const matchedArtists = event.artists.filter((a) =>
    userProfile.favoriteArtistIds.includes(a.id)
  )
  if (matchedArtists.length > 0) {
    score += 0.40
    const artistNames = matchedArtists.map((a) => a.name).join(', ')
    reasonsWithScore.push({
      reason: matchedArtists.length === 1
        ? `Features ${artistNames}, an artist you follow`
        : `Features ${artistNames}`,
      scoreContrib: 0.40,
    })
    signalCount++
  }

  // Genre overlap (up to 0.30)
  const overlappingGenres = event.canonicalGenres.filter((g) =>
    userProfile.favoriteGenres.includes(g)
  )
  if (overlappingGenres.length > 0) {
    const genreScore = Math.min(0.30, overlappingGenres.length * 0.12)
    score += genreScore
    reasonsWithScore.push({ reason: `${overlappingGenres.join(', ')} music`, scoreContrib: genreScore })
    signalCount++
  }

  // Venue match (0.20)
  if (event.venue && userProfile.favoriteVenueIds.includes(event.venue.id)) {
    score += 0.20
    reasonsWithScore.push({ reason: `At ${event.venue.name}, a favorite venue`, scoreContrib: 0.20 })
    signalCount++
  }

  // Event type match (0.15)
  if (event.eventType && userProfile.favoriteEventTypes.includes(event.eventType)) {
    score += 0.15
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
    reasonsWithScore.push({ reason: `${label} event`, scoreContrib: 0.15 })
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
    const attendanceScore = Math.min(0.08, attendanceGenreOverlap.length * 0.04)
    score += attendanceScore
    if (overlappingGenres.length === 0) {
      reasonsWithScore.push({ reason: 'Similar to events you\'re attending', scoreContrib: attendanceScore })
    }
    signalCount++
  }

  // Attendance event type match
  if (event.eventType && userProfile.attendanceEventTypes.includes(event.eventType)) {
    score += 0.05
    signalCount++
  }

  // Sort reasons by score contribution (highest first)
  const reasons = reasonsWithScore
    .sort((a, b) => b.scoreContrib - a.scoreContrib)
    .map(r => r.reason)

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
 * Rank and filter recommendations by score
 */
export function rankRecommendations(
  scoredEvents: ScoredEvent[],
  minScore = 0.15,
  maxResults = 10
): ScoredEvent[] {
  return scoredEvents
    .filter((e) => e.score >= minScore)
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
          region: { select: { timezone: true } },
        },
      },
      eventArtists: {
        select: {
          artistId: true,
          artist: {
            select: { id: true, name: true },
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
        eventType: e.eventType as string | null,
        summary: e.summary,
        imageUrl: e.imageUrl,
        venue: e.venue,
        artists: e.eventArtists.slice(0, 3).map((ea) => ({ id: ea.artist.id, name: ea.artist.name })),
      },
      matchedArtists: matchedArtistIds
        .map((id) => artistNameMap.get(id))
        .filter((name): name is string => !!name),
    }
  })
}
