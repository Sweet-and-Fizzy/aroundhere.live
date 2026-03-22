import { prisma } from '../../utils/prisma'
import { generateSlug, slugify } from '../../utils/html'
import { findNearestRegion } from '../../utils/find-nearest-region'
import { getOrCreateCommunitySource } from '../../utils/community-source'
import { notifyEventSubmission } from '../../services/notifications'
import { sendEventSubmissionAdminEmail, sendVenueModeratorSubmissionEmail } from '../../utils/email'
import { fromZonedTime } from 'date-fns-tz'
import { addDays } from 'date-fns'

async function linkArtistsToEvent(eventId: string, artistEntries: Array<{ id?: string; name: string }>) {
  for (let i = 0; i < artistEntries.length; i++) {
    const entry = artistEntries[i]!
    let artistId: string

    if (entry.id) {
      // Existing artist
      const existing = await prisma.artist.findUnique({ where: { id: entry.id } })
      if (!existing) continue
      artistId = existing.id
    } else {
      // Create or find by slug
      const name = entry.name.trim()
      if (!name) continue
      const slug = slugify(name)
      if (!slug) continue

      let artist = await prisma.artist.findUnique({ where: { slug } })
      if (!artist) {
        artist = await prisma.artist.create({
          data: { name, slug, spotifyMatchStatus: 'PENDING' },
        })
      }
      artistId = artist.id
    }

    // Check if already linked (avoid duplicates)
    const existingLink = await prisma.eventArtist.findUnique({
      where: { eventId_artistId: { eventId, artistId } },
    })
    if (!existingLink) {
      await prisma.eventArtist.create({
        data: { eventId, artistId, order: i + 1 },
      })
    }
  }
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const body = await readBody(event)
  const { title, date, showTime, doorsTime, venueId, locationName, locationAddress, locationLat, locationLng, coverCharge, ageRestriction, ticketUrl, description, imageUrl, sourceUrl, artists, repeat } = body

  // Validate required fields
  if (!title?.trim()) {
    throw createError({ statusCode: 400, message: 'Title is required' })
  }
  if (!date) {
    throw createError({ statusCode: 400, message: 'Date is required' })
  }
  if (!showTime) {
    throw createError({ statusCode: 400, message: 'Show time is required' })
  }
  if (!venueId && !locationName?.trim()) {
    throw createError({ statusCode: 400, message: 'Either a venue or location name is required' })
  }

  let regionId: string
  let timezone = 'America/New_York'
  let eventLocationName: string | null = null
  let eventLocationAddress: string | null = null
  let eventLocationCity: string | null = null
  let eventLocationState: string | null = null
  let eventLocationLat: number | null = null
  let eventLocationLng: number | null = null

  if (venueId) {
    // Verify venue exists
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, regionId: true, region: { select: { timezone: true } } },
    })
    if (!venue) {
      throw createError({ statusCode: 400, message: 'Venue not found' })
    }
    regionId = venue.regionId
    timezone = venue.region.timezone
  } else {
    // Venue-less event: use geocoded coordinates to find region
    if (locationLat && locationLng) {
      const region = await findNearestRegion(prisma, locationLat, locationLng)
      regionId = region.id
      timezone = region.timezone
    } else {
      // Fallback: use first active region
      const defaultRegion = await prisma.region.findFirst({
        where: { isActive: true },
        select: { id: true, timezone: true },
      })
      if (!defaultRegion) {
        throw createError({ statusCode: 500, message: 'No active regions available' })
      }
      regionId = defaultRegion.id
      timezone = defaultRegion.timezone
    }

    eventLocationName = locationName?.trim() || null
    eventLocationAddress = locationAddress?.trim() || null
    // Try to extract city/state from address
    if (locationAddress) {
      const parts = locationAddress.split(',').map((p: string) => p.trim())
      if (parts.length >= 2) {
        eventLocationCity = parts[parts.length - 2] || null
        eventLocationState = parts[parts.length - 1]?.split(' ')[0] || null
      }
    }
    eventLocationLat = locationLat || null
    eventLocationLng = locationLng || null
  }

  // Get or create community source
  const source = await getOrCreateCommunitySource(prisma)

  // Validate age restriction
  const validAgeRestrictions = ['ALL_AGES', 'EIGHTEEN_PLUS', 'TWENTY_ONE_PLUS']
  const finalAgeRestriction = ageRestriction && validAgeRestrictions.includes(ageRestriction)
    ? ageRestriction
    : 'ALL_AGES'

  // Validate repeat config
  let repeatCount = 1
  let repeatDays = 0
  if (repeat && repeat.frequency && repeat.count) {
    const count = parseInt(repeat.count, 10)
    if (count >= 2 && count <= 8) {
      repeatCount = count
      repeatDays = repeat.frequency === 'biweekly' ? 14 : 7
    }
  }

  // Artist entries to link
  const artistEntries: Array<{ id?: string; name: string }> = Array.isArray(artists) ? artists : []

  const createdEvents: Array<{ id: string; slug: string; title: string }> = []

  for (let i = 0; i < repeatCount; i++) {
    // Calculate date for this occurrence
    const occurrenceDate = i === 0
      ? new Date(`${date}T00:00:00`)
      : addDays(new Date(`${date}T00:00:00`), i * repeatDays)

    const dateStr = occurrenceDate.toISOString().split('T')[0]

    // Parse date and time into a proper DateTime
    const startsAt = fromZonedTime(`${dateStr}T${showTime}:00`, timezone)
    const doorsAt = doorsTime ? fromZonedTime(`${dateStr}T${doorsTime}:00`, timezone) : null

    // Generate slug with collision handling
    const baseSlug = generateSlug(title.trim(), startsAt)
    let slug = baseSlug
    const existing = await prisma.event.findFirst({ where: { slug } })
    if (existing) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
    }

    // Create the event
    const newEvent = await prisma.event.create({
      data: {
        regionId,
        venueId: venueId || null,
        title: title.trim(),
        slug,
        description: description?.trim() || null,
        startsAt,
        doorsAt,
        coverCharge: coverCharge?.trim() || null,
        ageRestriction: finalAgeRestriction,
        ticketUrl: ticketUrl?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        sourceUrl: sourceUrl?.trim() || null,
        sourceId: source.id,
        reviewStatus: 'PENDING',
        submittedById: userId,
        locationName: eventLocationName,
        locationAddress: eventLocationAddress,
        locationCity: eventLocationCity,
        locationState: eventLocationState,
        locationLat: eventLocationLat,
        locationLng: eventLocationLng,
        confidenceScore: 0.5,
      },
    })

    // Create EventSource record
    await prisma.eventSource.create({
      data: {
        eventId: newEvent.id,
        sourceId: source.id,
      },
    })

    // Link artists
    if (artistEntries.length > 0) {
      await linkArtistsToEvent(newEvent.id, artistEntries)
    }

    createdEvents.push({ id: newEvent.id, slug: newEvent.slug, title: newEvent.title })
  }

  // Get submitter email for notification
  const submitter = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  // Get venue info for notifications
  let venueName: string | null = null
  let venueSlug: string | null = null
  if (venueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { name: true, slug: true },
    })
    venueName = venue?.name || null
    venueSlug = venue?.slug || null
  }

  // Notify admins
  const notificationTitle = repeatCount > 1
    ? `${title.trim()} (${repeatCount} recurring events)`
    : title.trim()

  notifyEventSubmission({
    eventTitle: notificationTitle,
    submitterEmail: submitter?.email || 'unknown',
    venueName,
    locationName: eventLocationName,
    date,
  }).catch(err => console.error('[EventSubmission] Notification error:', err))

  // Send admin email notification
  const config = useRuntimeConfig()
  if (config.superAdminEmail) {
    sendEventSubmissionAdminEmail(config.superAdminEmail, {
      eventTitle: notificationTitle,
      submitterEmail: submitter?.email || 'unknown',
      date,
      location: venueName || eventLocationName || 'Unknown',
    }).catch(err => console.error('[EventSubmission] Admin email error:', err))
  }

  // Notify venue moderators if event is at a claimed venue
  // (admins also get notified above — intentional so nothing falls through the cracks)
  if (venueId && venueSlug) {
    prisma.venueModerator.findMany({
      where: {
        venueId,
        isActive: true,
        verifiedAt: { not: null },
      },
      include: {
        user: { select: { email: true } },
      },
    }).then(moderators => {
      for (const mod of moderators) {
        if (mod.user.email) {
          sendVenueModeratorSubmissionEmail(mod.user.email, {
            eventTitle: notificationTitle,
            submitterEmail: submitter?.email || 'unknown',
            date,
            venueName: venueName || 'Unknown',
            venueSlug: venueSlug!,
          }).catch(err => console.error('[EventSubmission] Moderator email error:', err))
        }
      }
    }).catch(err => console.error('[EventSubmission] Moderator lookup error:', err))
  }

  // Return array for recurring, single object for single
  if (repeatCount > 1) {
    return {
      success: true,
      events: createdEvents,
      event: createdEvents[0],
    }
  }

  return {
    success: true,
    event: createdEvents[0],
  }
})
