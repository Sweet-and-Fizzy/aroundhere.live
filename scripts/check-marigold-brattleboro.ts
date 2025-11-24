import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function check() {
  const venue = await prisma.venue.findFirst({ where: { slug: 'marigold-brattleboro' } })
  if (!venue) {
    console.log('Marigold Brattleboro venue not found')
    await prisma.$disconnect()
    await pool.end()
    return
  }

  const events = await prisma.event.findMany({
    where: { venueId: venue.id },
    orderBy: { startsAt: 'asc' },
    select: {
      title: true,
      description: true,
      startsAt: true,
      sourceUrl: true,
    }
  })

  console.log('Found', events.length, 'Marigold Brattleboro events:')
  events.forEach(e => {
    console.log('---')
    console.log('Title:', e.title)
    console.log('Date:', e.startsAt.toISOString().split('T')[0])
    console.log('Description:', e.description?.slice(0, 150) || 'NULL')
    console.log('URL:', e.sourceUrl)
  })

  await prisma.$disconnect()
  await pool.end()
}

check().catch(console.error)
