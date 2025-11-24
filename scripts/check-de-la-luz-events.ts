import 'dotenv/config'
import prisma from '../server/utils/prisma'

async function check() {
  const venue = await prisma.venue.findFirst({ where: { slug: 'de-la-luz' } })
  if (!venue) {
    console.log('Venue not found')
    return
  }
  
  const allEvents = await prisma.event.findMany({
    where: { venueId: venue.id },
    select: {
      id: true,
      title: true,
      startsAt: true,
      reviewStatus: true,
      sourceEventId: true,
      createdAt: true,
    },
    orderBy: { startsAt: 'asc' }
  })
  
  console.log(`\nAll events for De La Luz: ${allEvents.length}`)
  allEvents.forEach(e => {
    console.log(`  - ${e.title}`)
    console.log(`    Date: ${e.startsAt.toISOString()}`)
    console.log(`    Status: ${e.reviewStatus}`)
    console.log(`    Source ID: ${e.sourceEventId}`)
    console.log(`    Created: ${e.createdAt.toISOString()}`)
    console.log()
  })
  
  const upcoming = await prisma.event.findMany({
    where: {
      venueId: venue.id,
      startsAt: { gte: new Date() },
      reviewStatus: { in: ['APPROVED', 'PENDING'] },
    },
    select: { title: true, startsAt: true, reviewStatus: true }
  })
  
  console.log(`\nUpcoming events (APPROVED/PENDING): ${upcoming.length}`)
  upcoming.forEach(e => {
    console.log(`  - ${e.title} (${e.reviewStatus})`)
  })
  
  await prisma.$disconnect()
}

check().catch(console.error)

