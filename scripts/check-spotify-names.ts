/**
 * Check verified artists without spotifyName field populated
 */
import { prisma } from '../server/utils/prisma'

async function main() {
  // Check verified artists without spotifyName
  const verifiedWithoutName = await prisma.artist.findMany({
    where: {
      spotifyMatchStatus: 'VERIFIED',
      OR: [
        { spotifyName: null },
        { spotifyName: '' },
      ],
    },
    select: {
      id: true,
      name: true,
      spotifyId: true,
      spotifyName: true,
    },
    take: 10,
  })

  console.log('Verified artists without spotifyName:', verifiedWithoutName.length)
  if (verifiedWithoutName.length > 0) {
    console.log('\nFirst 10 examples:')
    verifiedWithoutName.forEach((a) => {
      console.log(`  - ${a.name} (ID: ${a.id}, SpotifyID: ${a.spotifyId}, SpotifyName: ${a.spotifyName || 'NULL'})`)
    })
  }

  // Check total verified artists
  const totalVerified = await prisma.artist.count({
    where: { spotifyMatchStatus: 'VERIFIED' },
  })
  console.log(`\nTotal verified artists: ${totalVerified}`)

  await prisma.$disconnect()
}

main().catch(console.error)
