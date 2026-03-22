import { prisma } from '../../../utils/prisma'
import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  const submission = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      doorsAt: true,
      coverCharge: true,
      ageRestriction: true,
      ticketUrl: true,
      imageUrl: true,
      sourceUrl: true,
      venueId: true,
      locationName: true,
      locationAddress: true,
      locationLat: true,
      locationLng: true,
      reviewStatus: true,
      submittedById: true,
      venue: {
        select: { id: true, name: true },
      },
      region: {
        select: { timezone: true },
      },
      eventArtists: {
        select: {
          artist: { select: { id: true, name: true } },
          order: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  })

  if (!submission) {
    throw createError({ statusCode: 404, message: 'Event not found' })
  }

  // Admins/moderators can load any event; submitters can only load their own
  const role = session?.user?.role as string | undefined
  const isAdmin = role === 'ADMIN' || role === 'MODERATOR'

  if (!isAdmin && submission.submittedById !== userId) {
    throw createError({ statusCode: 403, message: 'You can only edit your own submissions' })
  }

  // Only community-submitted events can be edited through this endpoint
  if (!submission.submittedById) {
    throw createError({ statusCode: 400, message: 'This event cannot be edited here' })
  }

  // Convert UTC dates back to form-friendly local date/time strings
  const timezone = submission.region.timezone || 'America/New_York'
  const zonedStart = toZonedTime(submission.startsAt, timezone)
  const date = format(zonedStart, 'yyyy-MM-dd')
  const showTime = format(zonedStart, 'HH:mm')

  let doorsTime: string | null = null
  if (submission.doorsAt) {
    const zonedDoors = toZonedTime(submission.doorsAt, timezone)
    doorsTime = format(zonedDoors, 'HH:mm')
  }

  return {
    id: submission.id,
    reviewStatus: submission.reviewStatus,
    title: submission.title,
    description: submission.description || '',
    date,
    showTime,
    doorsTime: doorsTime || '',
    venueId: submission.venueId,
    venueName: submission.venue?.name || null,
    locationName: submission.locationName || '',
    locationAddress: submission.locationAddress || '',
    locationLat: submission.locationLat,
    locationLng: submission.locationLng,
    coverCharge: submission.coverCharge || '',
    ageRestriction: submission.ageRestriction,
    ticketUrl: submission.ticketUrl || '',
    imageUrl: submission.imageUrl || '',
    sourceUrl: submission.sourceUrl || '',
    artists: submission.eventArtists.map(ea => ({
      id: ea.artist.id,
      name: ea.artist.name,
    })),
  }
})
