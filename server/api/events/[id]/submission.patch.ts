import { prisma } from '../../../utils/prisma'
import { slugify } from '../../../utils/html'
import { fromZonedTime } from 'date-fns-tz'

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

  const role = session?.user?.role as string | undefined
  const isAdmin = role === 'ADMIN' || role === 'MODERATOR'

  const existing = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      startsAt: true,
      submittedById: true,
      reviewStatus: true,
      regionId: true,
      region: { select: { timezone: true } },
      eventArtists: {
        select: { artistId: true },
        orderBy: { order: 'asc' as const },
      },
    },
  })

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Event not found' })
  }

  // Admins/moderators can edit any event; submitters can only edit their own
  if (!isAdmin && existing.submittedById !== userId) {
    throw createError({ statusCode: 403, message: 'You can only edit your own submissions' })
  }

  // Rejected events cannot be edited (submit a new one instead)
  if (existing.reviewStatus === 'REJECTED') {
    throw createError({ statusCode: 400, message: 'Rejected events cannot be edited. Please submit a new event.' })
  }

  const body = await readBody(event)
  const { title, date, showTime, doorsTime, coverCharge, ageRestriction, ticketUrl, description, imageUrl, sourceUrl, artists } = body

  if (!title?.trim()) {
    throw createError({ statusCode: 400, message: 'Title is required' })
  }
  if (!date) {
    throw createError({ statusCode: 400, message: 'Date is required' })
  }
  if (!showTime) {
    throw createError({ statusCode: 400, message: 'Show time is required' })
  }

  const timezone = existing.region.timezone || 'America/New_York'
  const startsAt = fromZonedTime(`${date}T${showTime}:00`, timezone)
  const doorsAt = doorsTime ? fromZonedTime(`${date}T${doorsTime}:00`, timezone) : null

  const validAgeRestrictions = ['ALL_AGES', 'EIGHTEEN_PLUS', 'TWENTY_ONE_PLUS']
  const finalAgeRestriction = ageRestriction && validAgeRestrictions.includes(ageRestriction)
    ? ageRestriction
    : undefined // don't change if invalid

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    title: title.trim(),
    description: description?.trim() || null,
    startsAt,
    doorsAt,
    coverCharge: coverCharge?.trim() || null,
    ticketUrl: ticketUrl?.trim() || null,
    imageUrl: imageUrl?.trim() || null,
    sourceUrl: sourceUrl?.trim() || null,
  }

  if (finalAgeRestriction) {
    updateData.ageRestriction = finalAgeRestriction
  }

  // Determine if approved event needs re-review
  // Admins keep current status; submitters get bumped to PENDING for major changes
  let needsReReview = false
  if (existing.reviewStatus === 'APPROVED' && !isAdmin) {
    const titleChanged = title.trim() !== existing.title
    const dateChanged = startsAt.getTime() !== existing.startsAt.getTime()
    const existingArtistIds = existing.eventArtists.map(ea => ea.artistId)
    const newArtistIds = Array.isArray(artists)
      ? artists.filter((a: { id?: string }) => a.id).map((a: { id?: string }) => a.id)
      : existingArtistIds
    const artistsChanged = Array.isArray(artists) && (
      newArtistIds.length !== existingArtistIds.length
      || newArtistIds.some((id, i) => id !== existingArtistIds[i])
      || artists.some((a: { id?: string }) => !a.id) // new artists added by name
    )

    needsReReview = titleChanged || dateChanged || artistsChanged
  }

  if (needsReReview) {
    updateData.reviewStatus = 'PENDING'
    updateData.reviewedAt = null
    updateData.reviewedBy = null
  }

  // Wrap event update and artist changes in a transaction
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.event.update({
      where: { id },
      data: updateData,
      select: { id: true, slug: true, title: true, reviewStatus: true },
    })

    // Update artists if provided
    if (Array.isArray(artists)) {
      await tx.eventArtist.deleteMany({ where: { eventId: id } })

      for (let i = 0; i < artists.length; i++) {
        const entry = artists[i]
        let artistId: string

        if (entry.id) {
          const existingArtist = await tx.artist.findUnique({ where: { id: entry.id } })
          if (!existingArtist) continue
          artistId = existingArtist.id
        } else {
          const name = entry.name?.trim()
          if (!name) continue
          const slug = slugify(name)
          if (!slug) continue

          let artist = await tx.artist.findUnique({ where: { slug } })
          if (!artist) {
            artist = await tx.artist.create({
              data: { name, slug, spotifyMatchStatus: 'PENDING' },
            })
          }
          artistId = artist.id
        }

        await tx.eventArtist.create({
          data: { eventId: id, artistId, order: i + 1 },
        })
      }
    }

    return result
  })

  return {
    success: true,
    event: updated,
    resubmitted: needsReReview,
  }
})
