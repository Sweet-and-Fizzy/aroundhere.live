import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  
  console.log('Checking Northampton events...\n')
  
  const events = await prisma.event.findMany({
    where: {
      venue: { city: { contains: 'Northampton', mode: 'insensitive' } },
      startsAt: { gte: now, lte: thirtyDaysFromNow },
      reviewStatus: { in: ['APPROVED', 'PENDING'] },
      isCancelled: false,
    },
    select: {
      title: true,
      isMusic: true,
      eventType: true,
    },
    orderBy: { startsAt: 'asc' }
  })
  
  console.log('Total events:', events.length)
  events.forEach(e => {
    const passes = e.isMusic === true || e.isMusic === null
    console.log(passes ? 'PASS' : 'FAIL', '|', e.title.substring(0, 50).padEnd(50), '| isMusic:', String(e.isMusic).padEnd(5), '| type:', e.eventType)
  })
  
  await prisma.$disconnect()
}

main().catch(console.error)
