import 'dotenv/config'
import prisma from '../server/utils/prisma'

async function check() {
  const events = await prisma.event.findMany({
    where: { 
      venue: { slug: 'de-la-luz' }
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      isMusic: true,
      eventType: true,
      classifiedAt: true
    },
    orderBy: { startsAt: 'asc' }
  })
  
  console.log(`De La Luz events: ${events.length}\n`)
  events.forEach(e => {
    const now = new Date()
    const isFuture = e.startsAt >= now
    console.log(`  - ${e.title}`)
    console.log(`    Date: ${e.startsAt.toISOString()} (future: ${isFuture})`)
    console.log(`    isMusic: ${e.isMusic}, eventType: ${e.eventType || 'null'}, classifiedAt: ${e.classifiedAt || 'null'}`)
    console.log()
  })
  
  const unclassified = events.filter(e => e.isMusic === null)
  console.log(`Unclassified: ${unclassified.length}`)
  
  await prisma.$disconnect()
}

check().catch(console.error)

