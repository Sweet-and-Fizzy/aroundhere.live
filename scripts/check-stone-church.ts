import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function check() {
  const venue = await prisma.venue.findFirst({ where: { slug: 'stone-church' } })
  if (venue === null) {
    console.log('Stone Church venue not found')
    await prisma.$disconnect()
    await pool.end()
    return
  }

  const events = await prisma.event.findMany({
    where: { venueId: venue.id },
    orderBy: { startsAt: 'asc' },
    select: {
      title: true,
      startsAt: true,
      description: true,
      sourceUrl: true,
      ticketUrl: true,
    }
  })

  console.log('Found', events.length, 'Stone Church events:')
  events.forEach(e => {
    console.log('---')
    console.log('Title:', e.title)
    console.log('Date:', e.startsAt.toISOString().split('T')[0])
    console.log('Source URL:', e.sourceUrl)
    console.log('Ticket URL:', e.ticketUrl === null ? 'NULL' : e.ticketUrl)
    console.log('Same?', e.ticketUrl === e.sourceUrl ? 'YES' : 'NO')
  })

  await prisma.$disconnect()
  await pool.end()
}

check().catch(console.error)
