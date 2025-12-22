/**
 * Add an artist to an event
 * POST /api/events/:id/artists
 *
 * Body:
 *   { artistId: string } - Add existing artist
 *   { artistName: string } - Create new artist and add
 *   { order?: number } - Billing order (1 = headliner, default: append to end)
 */

import { prisma } from '../../../../utils/prisma'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id')
  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const body = await readBody(event)

  // Verify event exists
  const eventRecord = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      eventArtists: {
        select: { order: true },
        orderBy: { order: 'desc' },
        take: 1,
      },
    },
  })

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  let artistId: string

  // Option 1: Add existing artist by ID
  if (body.artistId) {
    const artist = await prisma.artist.findUnique({
      where: { id: body.artistId },
    })
    if (!artist) {
      throw createError({
        statusCode: 404,
        message: 'Artist not found',
      })
    }
    artistId = artist.id
  }
  // Option 2: Create new artist by name
  else if (body.artistName) {
    const name = body.artistName.trim()
    if (name.length < 1 || name.length > 200) {
      throw createError({
        statusCode: 400,
        message: 'Artist name must be between 1 and 200 characters',
      })
    }

    const slug = slugify(name)
    if (!slug || slug.length < 1) {
      throw createError({
        statusCode: 400,
        message: 'Artist name produces invalid slug',
      })
    }

    // Check if artist already exists with this slug
    let artist = await prisma.artist.findUnique({
      where: { slug },
    })

    if (!artist) {
      artist = await prisma.artist.create({
        data: {
          name,
          slug,
          spotifyMatchStatus: 'PENDING',
        },
      })
    }

    artistId = artist.id
  }
  else {
    throw createError({
      statusCode: 400,
      message: 'Must provide either artistId or artistName',
    })
  }

  // Check if already linked
  const existingLink = await prisma.eventArtist.findUnique({
    where: {
      eventId_artistId: {
        eventId,
        artistId,
      },
    },
  })

  if (existingLink) {
    throw createError({
      statusCode: 409,
      message: 'Artist is already linked to this event',
    })
  }

  // Determine order
  const maxOrder = eventRecord.eventArtists[0]?.order || 0
  const order = body.order || maxOrder + 1

  // Create the link
  const eventArtist = await prisma.eventArtist.create({
    data: {
      eventId,
      artistId,
      order,
    },
    include: {
      artist: {
        select: {
          id: true,
          name: true,
          slug: true,
          genres: true,
          isLocal: true,
          spotifyId: true,
          spotifyName: true,
          spotifyMatchStatus: true,
        },
      },
    },
  })

  return {
    id: eventArtist.id,
    artistId: eventArtist.artistId,
    order: eventArtist.order,
    artist: eventArtist.artist,
  }
})
