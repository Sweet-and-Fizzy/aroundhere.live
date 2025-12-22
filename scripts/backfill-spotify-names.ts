/**
 * Backfill spotifyName for verified artists
 *
 * This script finds all artists with spotifyMatchStatus=VERIFIED
 * where spotifyName equals spotifyId (incorrectly populated),
 * and re-fetches the correct artist name from Spotify.
 */
import { prisma } from '../server/utils/prisma'
import { spotifyService } from '../server/services/spotify'

async function main() {
  console.log('Finding verified artists with incorrect spotifyName...')

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

  console.log(`Found ${artists.length} verified artists`)

  // Filter to those where spotifyName equals spotifyId (incorrect) or is null/empty
  const needsFix = artists.filter((a) => !a.spotifyName || a.spotifyName === a.spotifyId)
  console.log(`${needsFix.length} artists need spotifyName backfill`)

  if (needsFix.length === 0) {
    console.log('All artists have correct spotifyName! ✓')
    await prisma.$disconnect()
    return
  }

  let fixed = 0
  let errors = 0

  for (const artist of needsFix) {
    try {
      console.log(`\nFixing: ${artist.name}`)
      console.log(`  Current spotifyName: ${artist.spotifyName}`)
      console.log(`  Spotify ID: ${artist.spotifyId}`)

      // Fetch artist from Spotify
      const spotifyArtist = await spotifyService.getArtistById(artist.spotifyId!)

      if (!spotifyArtist) {
        console.log(`  ✗ Artist not found on Spotify`)
        errors++
        continue
      }

      console.log(`  Correct spotifyName: ${spotifyArtist.name}`)

      // Update the artist
      await prisma.artist.update({
        where: { id: artist.id },
        data: {
          spotifyName: spotifyArtist.name,
        },
      })

      console.log(`  ✓ Fixed`)
      fixed++

      // Rate limit to avoid hitting Spotify API limits
      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      console.log(`  ✗ Error: ${error}`)
      errors++
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Total processed: ${needsFix.length}`)
  console.log(`Fixed: ${fixed}`)
  console.log(`Errors: ${errors}`)

  await prisma.$disconnect()
}

main().catch(console.error)
