import 'dotenv/config'
import prisma from '../server/utils/prisma'

async function check() {
  const events = await prisma.event.findMany({
    where: { 
      venue: { slug: 'de-la-luz' },
      startsAt: { gte: new Date() } // Only future events
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      isMusic: true,
      eventType: true,
      canonicalGenres: true,
      genres: true,
      classificationConfidence: true,
      classifiedAt: true
    },
    orderBy: { startsAt: 'asc' }
  })
  
  console.log(`Future De La Luz events: ${events.length}\n`)
  events.forEach(e => {
    console.log(`  - ${e.title}`)
    console.log(`    Date: ${e.startsAt.toISOString().split('T')[0]}`)
    console.log(`    isMusic: ${e.isMusic}, eventType: ${e.eventType || 'null'}`)
    console.log(`    canonicalGenres: [${(e.canonicalGenres || []).join(', ') || 'none'}]`)
    console.log(`    genres (raw): [${(e.genres || []).join(', ') || 'none'}]`)
    console.log(`    confidence: ${e.classificationConfidence ? e.classificationConfidence.toFixed(2) : 'null'}`)
    console.log(`    classifiedAt: ${e.classifiedAt ? e.classifiedAt.toISOString() : 'null'}`)
    console.log()
  })
  
  await prisma.$disconnect()
}

check().catch(console.error)

