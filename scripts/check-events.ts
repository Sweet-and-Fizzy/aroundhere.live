import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Check total upcoming events
  const totalUpcoming = await prisma.event.count({
    where: {
      startsAt: {
        gte: now,
        lte: thirtyDaysFromNow
      }
    }
  })
  console.log('Total events in next 30 days:', totalUpcoming)

  // Check music events
  const musicEvents = await prisma.event.count({
    where: {
      startsAt: {
        gte: now,
        lte: thirtyDaysFromNow
      },
      isMusic: true
    }
  })
  console.log('Music events in next 30 days:', musicEvents)

  // Check by review status
  const approved = await prisma.event.count({
    where: {
      startsAt: {
        gte: now,
        lte: thirtyDaysFromNow
      },
      reviewStatus: 'APPROVED'
    }
  })
  console.log('Approved events in next 30 days:', approved)

  // Check music AND approved
  const musicApproved = await prisma.event.count({
    where: {
      startsAt: {
        gte: now,
        lte: thirtyDaysFromNow
      },
      isMusic: true,
      reviewStatus: 'APPROVED'
    }
  })
  console.log('Music + Approved events in next 30 days:', musicApproved)

  // Check by city
  const byCity = await prisma.event.groupBy({
    by: ['venueCity'],
    _count: true,
    where: {
      startsAt: {
        gte: now,
        lte: thirtyDaysFromNow
      }
    },
    orderBy: {
      _count: {
        venueCity: 'desc'
      }
    },
    take: 10
  })
  console.log('\nTop 10 cities with events in next 30 days:')
  byCity.forEach(c => console.log(`  ${c.venueCity || 'Unknown'}: ${c._count}`))

  await prisma.$disconnect()
}

main().catch(console.error)
