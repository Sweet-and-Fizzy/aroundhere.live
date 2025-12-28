import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/local_music'
const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const email = process.argv[2] || 'andrew@elytra.net'

  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      lastRecommendationSent: true,
    },
  })

  if (!user) {
    console.log(`User ${email} not found`)
    return
  }

  console.log('Before:', user)

  await prisma.user.update({
    where: { id: user.id },
    data: { lastRecommendationSent: null },
  })

  console.log('Reset lastRecommendationSent to null')
  console.log('User ID:', user.id)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
