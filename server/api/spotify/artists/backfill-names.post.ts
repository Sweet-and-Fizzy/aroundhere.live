/**
 * Backfill spotifyName for verified artists
 * POST /api/spotify/artists/backfill-names
 *
 * This endpoint finds all artists with spotifyMatchStatus=VERIFIED
 * where spotifyName equals spotifyId (incorrectly populated),
 * and re-fetches the correct artist name from Spotify.
 */
import { prisma } from '../../../utils/prisma'
import { spotifyService } from '../../../services/spotify'

export default defineEventHandler(async () => {
  // Find all verified artists
  const artists = await prisma.artist.findMany({
    where: {
      spotifyMatchStatus: 'VERIFIED',
      spotifyId: { not: null },
    },
    select: {
      id: true,
      name: true,
      spotifyId: true,
      spotifyName: true,
    },
  })

  // Filter to those where spotifyName equals spotifyId (incorrect)
  const needsFix = artists.filter((a) => a.spotifyName === a.spotifyId)

  if (needsFix.length === 0) {
    return {
      message: 'All artists have correct spotifyName!',
      total: artists.length,
      fixed: 0,
      errors: 0,
    }
  }

  let fixed = 0
  let errors = 0
  const errorDetails: string[] = []

  for (const artist of needsFix) {
    try {
      // Fetch artist from Spotify
      const spotifyArtist = await spotifyService.getArtistById(artist.spotifyId!)

      if (!spotifyArtist) {
        errors++
        errorDetails.push(`${artist.name}: Artist not found on Spotify`)
        continue
      }

      // Update the artist
      await prisma.artist.update({
        where: { id: artist.id },
        data: {
          spotifyName: spotifyArtist.name,
        },
      })

      fixed++

      // Rate limit to avoid hitting Spotify API limits
      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      errors++
      errorDetails.push(
        `${artist.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  return {
    message: 'Backfill complete',
    total: artists.length,
    needsFix: needsFix.length,
    fixed,
    errors,
    errorDetails: errorDetails.slice(0, 10), // Return first 10 errors
  }
})
