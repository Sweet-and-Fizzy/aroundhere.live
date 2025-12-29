/**
 * GET /api/user/recommendations
 *
 * Get personalized event recommendations for the authenticated user.
 * Uses the same scoring logic as the chat and weekly email recommendations.
 *
 * Query params:
 *   limit: Maximum number of recommendations (default 10, max 15)
 *   days: Number of days ahead to look (default 14, max 60)
 */

import { addDays } from 'date-fns'
import {
  getUserProfile,
  findCandidateEvents,
  scoreEventsForUser,
  rankRecommendations,
} from '../../services/recommendations'

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

  const limit = Math.min(Number(query.limit) || 10, 15)
  const days = Math.min(Number(query.days) || 14, 60)

  const now = new Date()
  const startDate = now
  const endDate = addDays(now, days)

  // Get user's profile with taste embedding and favorites
  const userProfile = await getUserProfile(userId)
  if (!userProfile) {
    throw createError({
      statusCode: 404,
      message: 'User profile not found',
    })
  }

  const hasTasteProfile = !!userProfile.tasteProfileEmbedding
  const hasFavorites = userProfile.favoriteArtistIds.length > 0 ||
    userProfile.favoriteVenueIds.length > 0 ||
    userProfile.favoriteGenres.length > 0 ||
    userProfile.favoriteEventTypes.length > 0

  if (!hasTasteProfile && !hasFavorites) {
    return {
      recommendations: [],
      hasTasteProfile: false,
      hasFavorites: false,
      message: 'Set up your interests to get personalized recommendations.',
    }
  }

  // Find candidate events with embeddings
  const candidates = await findCandidateEvents(
    startDate,
    endDate,
    [], // no exclusions
    limit * 3, // fetch more candidates than needed for scoring
    userProfile.regionId
  )

  if (candidates.length === 0) {
    return {
      recommendations: [],
      hasTasteProfile,
      hasFavorites,
      message: 'No upcoming events found in this date range.',
    }
  }

  // Score events against user's taste profile
  const scored = await scoreEventsForUser(candidates, userProfile)

  // Rank and filter by score (0.15 minimum)
  const ranked = rankRecommendations(scored, 0.15, limit)

  // Debug: log scores
  console.log('[User Recommendations API] Scores:', ranked.map(r => Math.round(r.score * 100)).slice(0, 10))

  return {
    recommendations: ranked.map(r => ({
      // Core Event fields for EventList/EventCard compatibility
      id: r.event.id,
      title: r.event.title,
      slug: r.event.slug,
      startsAt: r.event.startsAt.toISOString(),
      imageUrl: r.event.imageUrl,
      coverCharge: r.event.coverCharge,
      summary: r.event.summary,
      canonicalGenres: r.event.canonicalGenres,
      eventType: r.event.eventType,
      ageRestriction: 'ALL_AGES', // Default, not available in candidate data
      venue: r.event.venue ? {
        id: r.event.venue.id,
        name: r.event.venue.name,
        slug: r.event.venue.slug,
        city: r.event.venue.city,
      } : undefined,
      eventArtists: r.event.artists.map(a => ({
        artist: { name: a.name },
      })),
      // Recommendation-specific fields
      score: Math.round(r.score * 100),
      reasons: r.reasons,
    })),
    hasTasteProfile,
    hasFavorites,
    profileInfo: {
      favoriteArtistCount: userProfile.favoriteArtistIds.length,
      favoriteVenueCount: userProfile.favoriteVenueIds.length,
      favoriteGenreCount: userProfile.favoriteGenres.length,
      favoriteEventTypeCount: userProfile.favoriteEventTypes.length,
      hasInterestDescription: !!userProfile.interestDescription,
    },
  }
})
