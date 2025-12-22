import { prisma } from '../server/utils/prisma'

async function main() {
  const userId = process.argv[2] || 'cmisffjda000001unbdsb2aw5'

  // Get user's favorite artists
  const favorites = await prisma.userFavoriteArtist.findMany({
    where: { userId },
    include: { artist: true },
    take: 1
  })

  if (favorites.length === 0) {
    console.log('No favorite artists found for user')
    return
  }

  const artist = favorites[0].artist
  console.log('Using favorite artist:', artist.name)

  // Get a venue with an image
  const venue = await prisma.venue.findFirst({
    where: { imageUrl: { not: null } }
  })

  // Get default region
  const region = await prisma.region.findFirst()

  console.log('Artist:', artist?.id, artist?.name)
  console.log('Venue:', venue?.id, venue?.name)
  console.log('Region:', region?.id)

  if (!artist || !venue || !region) {
    console.log('Missing required data')
    return
  }

  // Create test event for tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(20, 0, 0, 0)

  const event = await prisma.event.create({
    data: {
      regionId: region.id,
      venueId: venue.id,
      title: `TEST: ${artist.name} Live at ${venue.name}`,
      slug: 'test-event-' + Date.now(),
      startsAt: tomorrow,
      canonicalGenres: ['rock', 'indie'],
      isMusic: true,
      isCancelled: false,
      imageUrl: venue.imageUrl, // Use venue image for the event
    }
  })

  console.log('Created event:', event.id, event.title)
  console.log('Image URL:', event.imageUrl)

  // Link artist to event
  await prisma.eventArtist.create({
    data: {
      eventId: event.id,
      artistId: artist.id,
      order: 1,
    }
  })

  console.log('Linked artist to event')
  console.log('\nTest event created! Event ID:', event.id)
  console.log('\nNow run: curl -sX POST "http://localhost:3000/api/cron/favorite-notifications"')
}

main().then(() => prisma.$disconnect())
