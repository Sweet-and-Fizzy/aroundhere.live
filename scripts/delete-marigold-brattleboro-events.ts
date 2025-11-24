import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function deleteEvents() {
  const venue = await prisma.venue.findFirst({ where: { slug: 'marigold-brattleboro' } })
  if (!venue) {
    console.log('Marigold Brattleboro venue not found')
    await prisma.$disconnect()
    await pool.end()
    return
  }

  // Delete all events for this venue
  const result = await prisma.event.deleteMany({
    where: { venueId: venue.id }
  })

  console.log('Deleted', result.count, 'Marigold Brattleboro events')

  await prisma.$disconnect()
  await pool.end()
}

deleteEvents().catch(console.error)
