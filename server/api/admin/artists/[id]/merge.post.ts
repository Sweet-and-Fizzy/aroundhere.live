/**
 * Merge an artist into another (target) artist
 * POST /api/admin/artists/:id/merge
 *
 * Body: { targetArtistId: string }
 *
 * This will:
 * 1. Transfer all event associations to the target artist
 * 2. Transfer all favorites to the target artist
 * 3. Merge Spotify data (prefer target's if verified, else use source's)
 * 4. Delete the source artist
 */

import { prisma } from '../../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const sourceArtistId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const { targetArtistId } = body

  if (!sourceArtistId || !targetArtistId) {
    throw createError({
      statusCode: 400,
      message: 'Both source and target artist IDs are required',
    })
  }

  if (sourceArtistId === targetArtistId) {
    throw createError({
      statusCode: 400,
      message: 'Cannot merge an artist into itself',
    })
  }

  // Fetch both artists
  const [sourceArtist, targetArtist] = await Promise.all([
    prisma.artist.findUnique({
      where: { id: sourceArtistId },
      include: {
        eventArtists: true,
        favoritedBy: true,
      },
    }),
    prisma.artist.findUnique({
      where: { id: targetArtistId },
    }),
  ])

  if (!sourceArtist) {
    throw createError({
      statusCode: 404,
      message: 'Source artist not found',
    })
  }

  if (!targetArtist) {
    throw createError({
      statusCode: 404,
      message: 'Target artist not found',
    })
  }

  // Perform the merge in a transaction
  const result = await prisma.$transaction(async (tx) => {
    let eventsMoved = 0
    let favoritesMoved = 0

    // 1. Transfer event associations
    // For each event the source artist is on, either add to target or skip if target already on event
    for (const eventArtist of sourceArtist.eventArtists) {
      // Check if target artist is already on this event
      const existingLink = await tx.eventArtist.findUnique({
        where: {
          eventId_artistId: {
            eventId: eventArtist.eventId,
            artistId: targetArtistId,
          },
        },
      })

      if (existingLink) {
        // Target already on this event, just delete the source link
        await tx.eventArtist.delete({
          where: { id: eventArtist.id },
        })
      } else {
        // Move the association to target artist
        await tx.eventArtist.update({
          where: { id: eventArtist.id },
          data: { artistId: targetArtistId },
        })
        eventsMoved++
      }
    }

    // 2. Transfer favorites
    for (const favorite of sourceArtist.favoritedBy) {
      // Check if user already favorites target artist
      const existingFavorite = await tx.userFavoriteArtist.findUnique({
        where: {
          userId_artistId: {
            userId: favorite.userId,
            artistId: targetArtistId,
          },
        },
      })

      if (existingFavorite) {
        // User already favorites target, delete source favorite
        await tx.userFavoriteArtist.delete({
          where: { id: favorite.id },
        })
      } else {
        // Move favorite to target artist
        await tx.userFavoriteArtist.update({
          where: { id: favorite.id },
          data: { artistId: targetArtistId },
        })
        favoritesMoved++
      }
    }

    // 3. Merge Spotify data if target doesn't have it or source has better data
    const shouldUpdateSpotify =
      // Target has no Spotify data
      !targetArtist.spotifyId ||
      // Source is verified and target is not
      (sourceArtist.spotifyMatchStatus === 'VERIFIED' &&
        targetArtist.spotifyMatchStatus !== 'VERIFIED') ||
      // Source has higher confidence
      ((sourceArtist.spotifyMatchConfidence || 0) >
        (targetArtist.spotifyMatchConfidence || 0) &&
        targetArtist.spotifyMatchStatus !== 'VERIFIED')

    if (shouldUpdateSpotify && sourceArtist.spotifyId) {
      await tx.artist.update({
        where: { id: targetArtistId },
        data: {
          spotifyId: sourceArtist.spotifyId,
          spotifyName: sourceArtist.spotifyName,
          spotifyMatchConfidence: sourceArtist.spotifyMatchConfidence,
          spotifyMatchStatus: sourceArtist.spotifyMatchStatus,
          spotifyPopularTracks: sourceArtist.spotifyPopularTracks ?? undefined,
          spotifyTracksUpdatedAt: sourceArtist.spotifyTracksUpdatedAt,
        },
      })
    }

    // 4. Merge genres (combine unique genres)
    const sourceGenres = (sourceArtist.genres as string[]) || []
    const targetGenres = (targetArtist.genres as string[]) || []
    const mergedGenres = [...new Set([...targetGenres, ...sourceGenres])]

    if (mergedGenres.length > targetGenres.length) {
      await tx.artist.update({
        where: { id: targetArtistId },
        data: { genres: mergedGenres },
      })
    }

    // 5. If source is local and target is not, mark target as local
    if (sourceArtist.isLocal && !targetArtist.isLocal) {
      await tx.artist.update({
        where: { id: targetArtistId },
        data: { isLocal: true },
      })
    }

    // 6. Delete the source artist
    await tx.artist.delete({
      where: { id: sourceArtistId },
    })

    return {
      eventsMoved,
      favoritesMoved,
      spotifyUpdated: shouldUpdateSpotify && !!sourceArtist.spotifyId,
    }
  })

  return {
    success: true,
    message: `Merged "${sourceArtist.name}" into "${targetArtist.name}"`,
    sourceArtist: {
      id: sourceArtist.id,
      name: sourceArtist.name,
    },
    targetArtist: {
      id: targetArtist.id,
      name: targetArtist.name,
    },
    ...result,
  }
})
