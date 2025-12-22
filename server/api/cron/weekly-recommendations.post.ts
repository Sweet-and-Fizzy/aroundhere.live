/**
 * Cron endpoint for sending weekly AI-curated recommendations
 * POST /api/cron/weekly-recommendations
 *
 * Authentication: Requires CRON_SECRET token via query param or header
 *
 * Query params:
 *   dryRun: 'true' to preview without sending emails
 *   limit: max users to process (default: 100)
 *   userId: process a specific user (for testing)
 *
 * Sends personalized recommendations in three sections:
 *   1. Favorite artists this week (deterministic)
 *   2. Weekend picks (Fri-Sun, AI-curated)
 *   3. Coming up (Mon+2wks, AI-curated)
 *
 * Recommended crontab:
 *   Wednesday 8am: 0 8 * * 3 curl -sX POST "http://localhost:3000/api/cron/weekly-recommendations?token=$CRON_SECRET"
 */

import { verifyCronAuth } from '../../utils/cron-auth'
import { sendRecommendationEmail } from '../../utils/email'
import { prisma } from '../../utils/prisma'
import {
  getUserProfile,
  findCandidateEvents,
  scoreEventsForUser,
  rankRecommendations,
  findFavoriteArtistEvents,
  MIN_CONFIDENCE_THRESHOLD,
} from '../../services/recommendations'
import { curateMultipleSections, type CuratedEvent } from '../../services/recommendations/ai-curator'

export default defineEventHandler(async (event) => {
  // Verify cron authentication
  verifyCronAuth(event)

  const query = getQuery(event)
  const dryRun = query.dryRun === 'true'
  const limit = Math.min(Number(query.limit) || 100, 500)
  const targetUserId = query.userId as string | undefined

  const start = Date.now()
  const results = {
    usersProcessed: 0,
    emailsSent: 0,
    emailsFailed: 0,
    usersSkipped: 0,
    recommendationsLogged: 0,
    tokensUsed: 0,
    errors: [] as string[],
  }

  try {
    // Calculate date ranges
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    // Section 1: Favorite artists - next 7 days
    const favoriteArtistsEnd = new Date(todayStart)
    favoriteArtistsEnd.setDate(favoriteArtistsEnd.getDate() + 7)

    // Section 2: Weekend picks - next Fri, Sat, Sun
    const { weekendStart, weekendEnd } = getNextWeekend(now)

    // Section 3: Coming up - Monday after weekend through 2 weeks out
    const comingUpStart = new Date(weekendEnd)
    comingUpStart.setDate(comingUpStart.getDate() + 1) // Monday after weekend
    const comingUpEnd = new Date(todayStart)
    comingUpEnd.setDate(comingUpEnd.getDate() + 14)

    console.log(`[Weekly Recommendations] Date ranges:`)
    console.log(`  Favorite artists: ${todayStart.toDateString()} - ${favoriteArtistsEnd.toDateString()}`)
    console.log(`  Weekend picks: ${weekendStart.toDateString()} - ${weekendEnd.toDateString()}`)
    console.log(`  Coming up: ${comingUpStart.toDateString()} - ${comingUpEnd.toDateString()}`)

    // Get users who want recommendations
    const userWhere: Record<string, unknown> = {
      enableRecommendations: true,
    }

    if (targetUserId) {
      userWhere.id = targetUserId
    } else {
      // Only send to users we haven't emailed in the past 6 days
      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
      userWhere.OR = [
        { lastRecommendationSent: null },
        { lastRecommendationSent: { lt: sixDaysAgo } },
      ]
    }

    const users = await prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        email: true,
        interestDescription: true,
      },
      take: limit,
    })

    console.log(`[Weekly Recommendations] Processing ${users.length} users`)

    for (const user of users) {
      results.usersProcessed++

      try {
        // Get user's full profile for scoring
        const userProfile = await getUserProfile(user.id)
        if (!userProfile) {
          console.log(`[Weekly Recommendations] User ${user.email}: No profile, skipping`)
          results.usersSkipped++
          continue
        }

        // Section 1: Favorite artist events (deterministic)
        // Note: No region filter - show favorite artists regardless of where they're playing
        const favoriteArtistEvents = await findFavoriteArtistEvents(
          user.id,
          todayStart,
          favoriteArtistsEnd
        )

        // Track event IDs for deduplication across sections
        const usedEventIds = new Set(favoriteArtistEvents.map((e) => e.event.id))

        // Section 2 & 3: Get and score candidate events
        let weekendPicks: CuratedEvent[] = []
        let comingUpPicks: CuratedEvent[] = []

        // Only do AI curation if user has a taste profile
        if (userProfile.tasteProfileEmbedding) {
          // Weekend candidates - filter by region for discovery, exclude favorite artist events
          const weekendCandidates = await findCandidateEvents(
            weekendStart,
            weekendEnd,
            Array.from(usedEventIds),
            50,
            userProfile.regionId
          )

          const scoredWeekend = await scoreEventsForUser(weekendCandidates, userProfile)
          const rankedWeekend = rankRecommendations(scoredWeekend, MIN_CONFIDENCE_THRESHOLD, 15)

          // Add weekend picks to used set before getting coming up
          const weekendEventIds = rankedWeekend.map((e) => e.event.id)

          // Coming up candidates - filter by region, exclude favorite artist + weekend
          const comingUpExclude = [...Array.from(usedEventIds), ...weekendEventIds]
          const comingUpCandidates = await findCandidateEvents(
            comingUpStart,
            comingUpEnd,
            comingUpExclude,
            50,
            userProfile.regionId
          )

          const scoredComingUp = await scoreEventsForUser(comingUpCandidates, userProfile)
          const rankedComingUp = rankRecommendations(scoredComingUp, MIN_CONFIDENCE_THRESHOLD, 15)

          // AI curate both sections
          if (rankedWeekend.length > 0 || rankedComingUp.length > 0) {
            const curationResult = await curateMultipleSections(
              rankedWeekend,
              rankedComingUp,
              userProfile,
              5
            )

            weekendPicks = curationResult.weekend
            comingUpPicks = curationResult.comingUp
            results.tokensUsed += curationResult.tokensUsed

            // Add weekend picks to used set
            for (const pick of weekendPicks) {
              usedEventIds.add(pick.event.id)
            }
          }
        }

        // Check if we have any recommendations to send
        const totalRecs = favoriteArtistEvents.length + weekendPicks.length + comingUpPicks.length
        if (totalRecs === 0) {
          console.log(`[Weekly Recommendations] User ${user.email}: No recommendations, skipping`)
          results.usersSkipped++
          continue
        }

        console.log(
          `[Weekly Recommendations] User ${user.email}: ${favoriteArtistEvents.length} favorites, ${weekendPicks.length} weekend, ${comingUpPicks.length} coming up`
        )

        if (dryRun) {
          console.log(`[Dry Run] Would send email to ${user.email}`)
          results.emailsSent++
        } else {
          // Send the recommendation email
          const emailResult = await sendRecommendationEmail(user.email, {
            favoriteArtistEvents,
            weekendPicks,
            comingUpPicks,
          })

          if (emailResult.success) {
            results.emailsSent++

            // Log recommendations
            const logsToCreate: Array<{
              userId: string
              eventId: string
              recommendationType: string
              confidenceScore: number
              matchReason: string
            }> = []

            for (const fav of favoriteArtistEvents) {
              logsToCreate.push({
                userId: user.id,
                eventId: fav.event.id,
                recommendationType: 'FAVORITE_ARTIST',
                confidenceScore: 1.0,
                matchReason: `Featuring: ${fav.matchedArtists.join(', ')}`,
              })
            }

            for (const pick of weekendPicks) {
              logsToCreate.push({
                userId: user.id,
                eventId: pick.event.id,
                recommendationType: 'AI_WEEKEND_PICK',
                confidenceScore: pick.confidence,
                matchReason: pick.explanation,
              })
            }

            for (const pick of comingUpPicks) {
              logsToCreate.push({
                userId: user.id,
                eventId: pick.event.id,
                recommendationType: 'AI_COMING_UP',
                confidenceScore: pick.confidence,
                matchReason: pick.explanation,
              })
            }

            if (logsToCreate.length > 0) {
              await prisma.recommendationLog.createMany({
                data: logsToCreate,
              })
              results.recommendationsLogged += logsToCreate.length
            }

            // Update last recommendation sent timestamp
            await prisma.user.update({
              where: { id: user.id },
              data: { lastRecommendationSent: new Date() },
            })
          } else {
            results.emailsFailed++
            results.errors.push(`Failed to send to ${user.email}`)
          }
        }
      } catch (error) {
        results.emailsFailed++
        const errorMsg = `Error processing user ${user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`
        results.errors.push(errorMsg)
        console.error(`[Weekly Recommendations] ${errorMsg}`)
      }
    }

    console.log(
      `[Weekly Recommendations] Completed: ${results.emailsSent} sent, ${results.emailsFailed} failed, ${results.usersSkipped} skipped, ${results.tokensUsed} tokens`
    )

    return {
      success: true,
      dryRun,
      duration: Date.now() - start,
      results,
    }
  } catch (error) {
    console.error('[Weekly Recommendations] Fatal error:', error)
    return {
      success: false,
      dryRun,
      duration: Date.now() - start,
      results,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

/**
 * Get the next weekend (Fri, Sat, Sun) from a given date
 */
function getNextWeekend(from: Date): { weekendStart: Date; weekendEnd: Date } {
  const dayOfWeek = from.getDay() // 0 = Sunday, 5 = Friday, 6 = Saturday

  const weekendStart = new Date(from)
  weekendStart.setHours(0, 0, 0, 0)

  // Find next Friday (or today if it's already Fri-Sun)
  if (dayOfWeek === 0) {
    // Sunday - start from Friday 5 days from now
    weekendStart.setDate(weekendStart.getDate() + 5)
  } else if (dayOfWeek === 6) {
    // Saturday - include today (use yesterday's Friday)
    weekendStart.setDate(weekendStart.getDate() - 1)
  } else if (dayOfWeek === 5) {
    // Friday - start from today
    // weekendStart is already correct
  } else {
    // Mon-Thu - find this coming Friday
    const daysUntilFriday = 5 - dayOfWeek
    weekendStart.setDate(weekendStart.getDate() + daysUntilFriday)
  }

  const weekendEnd = new Date(weekendStart)
  weekendEnd.setDate(weekendEnd.getDate() + 2) // Sunday
  weekendEnd.setHours(23, 59, 59, 999)

  return { weekendStart, weekendEnd }
}
