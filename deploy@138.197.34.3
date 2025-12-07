import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function analyze() {
  const events = await prisma.event.findMany({
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      sourceEventId: true,
      startsAt: true,
    },
    orderBy: { startsAt: 'asc' }
  })

  console.log('Total events:', events.length)

  const withSourceUrl = events.filter(e => e.sourceUrl)
  console.log('Events with sourceUrl:', withSourceUrl.length)

  const withSourceEventId = events.filter(e => e.sourceEventId)
  console.log('Events with sourceEventId:', withSourceEventId.length)

  // Check for duplicate sourceUrls
  const urlCounts = new Map<string, number>()
  for (const e of withSourceUrl) {
    urlCounts.set(e.sourceUrl!, (urlCounts.get(e.sourceUrl!) || 0) + 1)
  }

  const duplicateUrls = [...urlCounts.entries()].filter(([_, count]) => count > 1)
  console.log('\nDuplicate sourceUrls:', duplicateUrls.length)

  if (duplicateUrls.length > 0) {
    console.log('\nExamples of duplicate URLs:')
    for (const [url, count] of duplicateUrls.slice(0, 10)) {
      console.log('  ' + count + 'x: ' + url)
      const dupes = events.filter(e => e.sourceUrl === url)
      for (const d of dupes.slice(0, 3)) {
        console.log('    - ' + d.title + ' (' + d.startsAt.toISOString().split('T')[0] + ')')
      }
    }
  }

  const uniqueUrls = urlCounts.size
  console.log('\nUniqueness: ' + uniqueUrls + '/' + withSourceUrl.length +
    ' (' + (uniqueUrls/withSourceUrl.length*100).toFixed(1) + '%)')

  await prisma.$disconnect()
  await pool.end()
}

analyze().catch(console.error)
