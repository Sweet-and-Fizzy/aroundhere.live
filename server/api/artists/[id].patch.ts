/**
 * Update an artist's details
 * PATCH /api/artists/:id
 *
 * Body:
 *   { name: string } - Update artist name (also updates slug)
 *   { genres: string[] } - Update genres
 *   { isLocal: boolean } - Mark as local artist
 */

import { prisma } from '../../utils/prisma'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default defineEventHandler(async (event) => {
  const artistId = getRouterParam(event, 'id')
  if (!artistId) {
    throw createError({
      statusCode: 400,
      message: 'Artist ID is required',
    })
  }

  const body = await readBody(event)

  // Verify artist exists
  const existing = await prisma.artist.findUnique({
    where: { id: artistId },
  })

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Artist not found',
    })
  }

  // Build update data
  const updateData: {
    name?: string
    slug?: string
    genres?: string[]
    isLocal?: boolean
  } = {}

  // Update name and regenerate slug
  if (body.name && typeof body.name === 'string') {
    const newName = body.name.trim()
    if (newName.length < 1 || newName.length > 200) {
      throw createError({
        statusCode: 400,
        message: 'Artist name must be between 1 and 200 characters',
      })
    }

    const newSlug = slugify(newName)
    if (!newSlug || newSlug.length < 1) {
      throw createError({
        statusCode: 400,
        message: 'Artist name produces invalid slug',
      })
    }

    // Check if new slug conflicts with another artist
    if (newSlug !== existing.slug) {
      const conflicting = await prisma.artist.findUnique({
        where: { slug: newSlug },
      })
      if (conflicting) {
        throw createError({
          statusCode: 409,
          message: `Another artist already exists with slug "${newSlug}"`,
        })
      }
    }

    updateData.name = newName
    updateData.slug = newSlug
  }

  // Update genres
  if (body.genres && Array.isArray(body.genres)) {
    updateData.genres = body.genres.map((g: string) => g.toLowerCase().trim())
  }

  // Update isLocal flag
  if (typeof body.isLocal === 'boolean') {
    updateData.isLocal = body.isLocal
  }

  if (Object.keys(updateData).length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No valid fields to update',
    })
  }

  const updated = await prisma.artist.update({
    where: { id: artistId },
    data: updateData,
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
  })

  return updated
})
