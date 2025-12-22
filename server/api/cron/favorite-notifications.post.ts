/**
 * Cron endpoint for sending favorite artist alerts
 * POST /api/cron/favorite-notifications
 *
 * Authentication: Requires CRON_SECRET token via query param or header
 *
 * Query params:
 *   dryRun: 'true' to preview without sending emails
 *
 * Sends daily alerts when favorite artists have new shows announced.
 *
 * Recommended crontab:
 *   Daily at 7am: 0 7 * * * curl -sX POST "http://localhost:3000/api/cron/favorite-notifications?token=$CRON_SECRET"
 */

import { verifyCronAuth } from '../../utils/cron-auth'
import { sendFavoriteNotificationEmail } from '../../utils/email'
import { prisma } from '../../utils/prisma'

interface MatchedEvent {
  id: string
  title: string
  slug: string
  startsAt: Date
  venue: {
    name: string
    city: string | null
  }
  matchedArtists: string[]
  matchedVenue: boolean
  matchedGenres: string[]
}

export default defineEventHandler(async (event) => {
  // Verify cron authentication
  verifyCronAuth(event)

  const query = getQuery(event)
  const dryRun = query.dryRun === 'true'

  const start = Date.now()
  const results = {
    usersProcessed: 0,
    emailsSent: 0,
    emailsFailed: 0,
    usersSkipped: 0,
    errors: [] as string[],
  }

  try {
    // Calculate the lookback period (24 hours)
    const now = new Date()
    const lookbackDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Get users who want artist alerts
    const users = await prisma.user.findMany({
      where: {
        notifyFavoriteArtists: true,
        // Only get users we haven't notified in the last 24 hours
        OR: [
          { lastNotificationSent: null },
          { lastNotificationSent: { lt: lookbackDate } },
        ],
      },
      select: {
        id: true,
        email: true,
        lastNotificationSent: true,
        favoriteArtists: {
          select: {
            artistId: true,
            artist: { select: { name: true } },
          },
        },
      },
    })

    console.log(`[Artist Alerts] Processing ${users.length} users`)

    for (const user of users) {
      results.usersProcessed++

      const favoriteArtistIds = user.favoriteArtists.map(fa => fa.artistId)

      // Skip users with no favorite artists
      if (favoriteArtistIds.length === 0) {
        results.usersSkipped++
        continue
      }

      try {
        // Find events created since last notification
        const sinceDate = user.lastNotificationSent || lookbackDate

        // Build artist name lookup
        const artistNameMap = new Map(
          user.favoriteArtists.map(fa => [fa.artistId, fa.artist.name])
        )

        // Find events with favorite artists that are upcoming and were recently added
        const matchingEvents = await prisma.event.findMany({
          where: {
            isCancelled: false,
            startsAt: { gte: now }, // Only future events
            createdAt: { gte: sinceDate }, // Only recently added events
            // Skip events from sources with paused notifications
            source: {
              notificationsPaused: false,
            },
            // Events with favorite artists
            eventArtists: {
              some: {
                artistId: { in: favoriteArtistIds },
              },
            },
          },
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
              },
            },
            eventArtists: {
              select: {
                artistId: true,
              },
            },
          },
          orderBy: { startsAt: 'asc' },
          take: 20, // Limit to avoid huge emails
        })

        if (matchingEvents.length === 0) {
          results.usersSkipped++
          continue
        }

        // Enrich events with matched artist names
        const enrichedEvents: MatchedEvent[] = matchingEvents.map(evt => {
          const eventArtistIds = evt.eventArtists.map(ea => ea.artistId)

          const matchedArtistIds = eventArtistIds.filter(id =>
            favoriteArtistIds.includes(id)
          )
          const matchedArtists = matchedArtistIds
            .map(id => artistNameMap.get(id))
            .filter(Boolean) as string[]

          return {
            id: evt.id,
            title: evt.title,
            slug: evt.slug,
            startsAt: evt.startsAt,
            venue: {
              name: evt.venue?.name || 'TBA',
              city: evt.venue?.city || null,
            },
            matchedArtists,
            matchedVenue: false,
            matchedGenres: [],
          }
        })

        if (dryRun) {
          console.log(`[Dry Run] Would send email to ${user.email} with ${enrichedEvents.length} events`)
          results.emailsSent++
        } else {
          // Send the notification email
          const emailResult = await sendFavoriteNotificationEmail(
            user.email,
            enrichedEvents
          )

          if (emailResult.success) {
            results.emailsSent++

            // Update last notification sent timestamp
            await prisma.user.update({
              where: { id: user.id },
              data: { lastNotificationSent: now },
            })
          } else {
            results.emailsFailed++
            results.errors.push(`Failed to send to ${user.email}`)
          }
        }
      } catch (error) {
        results.emailsFailed++
        results.errors.push(
          `Error processing user ${user.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    console.log(`[Artist Alerts] Completed: ${results.emailsSent} sent, ${results.emailsFailed} failed, ${results.usersSkipped} skipped`)

    return {
      success: true,
      dryRun,
      duration: Date.now() - start,
      results,
    }
  } catch (error) {
    console.error('[Artist Alerts] Fatal error:', error)
    return {
      success: false,
      dryRun,
      duration: Date.now() - start,
      results,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})
