/**
 * Cron endpoint for sending weekly AI-curated recommendations
 * POST /api/cron/weekly-recommendations
 *
 * Authentication: Requires CRON_SECRET token via query param or header
 *
 * Query params:
 *   dryRun: 'true' to preview without sending emails
 *   limit: max users to process (default: 100)
 *   userId: process a specific user (bypasses lastRecommendationSent check)
 *
 * Sends personalized recommendations in three sections:
 *   1. Favorite artists this week (deterministic)
 *   2. Weekend picks (Fri-Sun, AI-curated)
 *   3. Coming up (Mon+2wks, AI-curated)
 *
 * Recommended crontab:
 *   Wednesday 8am: 0 8 * * 3 curl -sX POST "http://localhost:3000/api/cron/weekly-recommendations?token=$CRON_SECRET"
 *
 * Testing:
 *   To send a test email to a specific user (bypasses the 6-day cooldown):
 *   curl -X POST "http://localhost:3000/api/cron/weekly-recommendations?userId=USER_ID" -H "Authorization: Bearer $CRON_SECRET"
 *
 *   Find user IDs via the database or check server logs for previous sends.
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
} from '../../services/recommendations'
import { curateMultipleSections, type CuratedEvent } from '../../services/recommendations/ai-curator'

interface WeekendListingEvent {
  time: string
  venue: string
  title: string
  slug: string
  attendanceStatus?: 'INTERESTED' | 'GOING'
}

interface WeekendDayListings {
  date: Date
  dayLabel: string
  events: WeekendListingEvent[]
}

interface UpcomingAttendanceEvent {
  id: string
  title: string
  slug: string
  startsAt: Date
  imageUrl: string | null
  venue: {
    name: string
    city: string | null
  } | null
  status: 'INTERESTED' | 'GOING'
}

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
        regionId: true,
        region: {
          select: {
            timezone: true,
          },
        },
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
        // Use 'now' to exclude events that have already started
        const favoriteArtistEvents = await findFavoriteArtistEvents(
          user.id,
          now,
          favoriteArtistsEnd
        )

        // Track event IDs for deduplication across sections
        // Include attended events (interested/going) so we don't recommend what they already know about
        const usedEventIds = new Set([
          ...favoriteArtistEvents.map((e) => e.event.id),
          ...userProfile.attendingEventIds,
        ])

        // Section 2 & 3: Get and score candidate events
        let weekendPicks: CuratedEvent[] = []
        let comingUpPicks: CuratedEvent[] = []

        // Only do AI curation if user has a taste profile
        if (userProfile.tasteProfileEmbedding) {
          // Weekend candidates - filter by region for discovery, exclude favorite artist events and attended events
          // Use max of weekendStart and now to exclude past events
          const weekendQueryStart = weekendStart > now ? weekendStart : now
          const weekendCandidates = await findCandidateEvents(
            weekendQueryStart,
            weekendEnd,
            Array.from(usedEventIds),
            50,
            userProfile.regionId
          )

          const scoredWeekend = await scoreEventsForUser(weekendCandidates, userProfile)
          // Use default threshold (0.15) - AI curation will further filter weak matches
          const rankedWeekend = rankRecommendations(scoredWeekend)

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
          const rankedComingUp = rankRecommendations(scoredComingUp)

          // AI curate both sections
          if (rankedWeekend.length > 0 || rankedComingUp.length > 0) {
            const curationResult = await curateMultipleSections(
              rankedWeekend,
              rankedComingUp,
              userProfile,
              6
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

        // Fetch user's attendance records for upcoming events
        const userAttendance = await prisma.userEventAttendance.findMany({
          where: {
            userId: user.id,
            event: {
              startsAt: { gte: todayStart },
              isCancelled: false,
            },
          },
          select: {
            eventId: true,
            status: true,
            event: {
              select: {
                id: true,
                title: true,
                slug: true,
                startsAt: true,
                imageUrl: true,
                venue: {
                  select: {
                    name: true,
                    city: true,
                    region: { select: { timezone: true } },
                  },
                },
              },
            },
          },
          orderBy: {
            event: { startsAt: 'asc' },
          },
        })

        // Create attendance lookup map
        const attendanceMap = new Map<string, 'INTERESTED' | 'GOING'>()
        for (const a of userAttendance) {
          attendanceMap.set(a.eventId, a.status)
        }

        // Section: Your Upcoming Events (events user is interested in or going to)
        const upcomingAttendanceEvents: UpcomingAttendanceEvent[] = userAttendance.map(a => ({
          id: a.event.id,
          title: a.event.title,
          slug: a.event.slug,
          startsAt: a.event.startsAt,
          imageUrl: a.event.imageUrl,
          venue: a.event.venue,
          status: a.status,
        }))

        // Section 4: Full week listings for user's region
        // Shows all events from today through next 7 days
        let fullWeekendListings: WeekendDayListings[] = []
        if (user.regionId) {
          const weekListingEnd = new Date(now)
          weekListingEnd.setDate(weekListingEnd.getDate() + 7)
          weekListingEnd.setHours(23, 59, 59, 999)

          // Fetch all events for the user's region for the next week
          // Use 'now' to exclude events that have already started
          const allWeekendEvents = await prisma.event.findMany({
            where: {
              regionId: user.regionId,
              startsAt: {
                gte: now,
                lte: weekListingEnd,
              },
              isCancelled: false,
              reviewStatus: { in: ['APPROVED', 'PENDING'] },
              // Only include music events
              OR: [
                { isMusic: true },
                { isMusic: null, eventType: null }, // Unclassified, might be music
              ],
            },
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
            orderBy: {
              startsAt: 'asc',
            },
          })

          // Group events by day using the region's timezone
          // Events are stored in UTC but should be displayed in local event time
          const timezone = user.region?.timezone || 'America/New_York'
          const eventsByDay = new Map<string, { sortKey: number; events: typeof allWeekendEvents }>()
          for (const event of allWeekendEvents) {
            // Format date in region timezone to get the correct local date
            const dateKey = event.startsAt.toLocaleDateString('en-US', {
              timeZone: timezone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
            if (!eventsByDay.has(dateKey)) {
              // Use first event's timestamp as sort key for the day
              eventsByDay.set(dateKey, { sortKey: event.startsAt.getTime(), events: [] })
            }
            eventsByDay.get(dateKey)!.events.push(event)
          }

          // Convert to listing format with attendance status, sorted by date
          fullWeekendListings = Array.from(eventsByDay.entries())
            .sort(([, a], [, b]) => a.sortKey - b.sortKey)
            .filter(([, { events }]) => events.length > 0)
            .map(([_dateKey, { events }]) => {
              // Use the first event's date for the label (they're all on the same day)
              const firstEvent = events[0]!
              const dayLabel = firstEvent.startsAt.toLocaleDateString('en-US', {
                timeZone: timezone,
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })
              return {
                date: firstEvent.startsAt,
                dayLabel,
                events: events.map(e => ({
                  time: e.startsAt.toLocaleTimeString('en-US', {
                    timeZone: timezone,
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
                  venue: e.venue?.name || 'TBA',
                  title: e.title,
                  slug: e.slug,
                  attendanceStatus: attendanceMap.get(e.id),
                })),
              }
            })
        }

        // Check if we have any content to send
        // Attendance alone is not enough - we need recommendations OR listings
        // Attendance is supplemental info shown alongside other content
        const totalRecs = favoriteArtistEvents.length + weekendPicks.length + comingUpPicks.length
        const totalListings = fullWeekendListings.reduce((sum, day) => sum + day.events.length, 0)
        const totalAttendance = upcomingAttendanceEvents.length
        if (totalRecs === 0 && totalListings === 0) {
          console.log(`[Weekly Recommendations] User ${user.email}: No recommendations or listings, skipping (${totalAttendance} attendance events)`)
          results.usersSkipped++
          continue
        }

        console.log(
          `[Weekly Recommendations] User ${user.email}: ${favoriteArtistEvents.length} favorites, ${weekendPicks.length} weekend, ${comingUpPicks.length} coming up, ${totalAttendance} attending, ${totalListings} listings`
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
            upcomingAttendanceEvents,
            fullWeekendListings,
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
                confidenceScore: pick.score,
                matchReason: pick.explanation,
              })
            }

            for (const pick of comingUpPicks) {
              logsToCreate.push({
                userId: user.id,
                eventId: pick.event.id,
                recommendationType: 'AI_COMING_UP',
                confidenceScore: pick.score,
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
