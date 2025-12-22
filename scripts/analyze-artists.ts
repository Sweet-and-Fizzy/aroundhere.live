/**
 * Analyze artist extraction patterns
 * Run with: npx tsx scripts/analyze-artists.ts
 */

import { prisma } from '../server/utils/prisma'
import { extractArtistName, extractArtistNames } from '../server/utils/artist-extraction'

async function main() {
  // Get events without artists linked
  const eventsWithoutArtists = await prisma.event.findMany({
    where: {
      isMusic: true,
      eventArtists: { none: {} },
      startsAt: { gte: new Date() }
    },
    select: { id: true, title: true },
    orderBy: { startsAt: 'asc' },
    take: 50
  })

  console.log('=== EVENTS WITHOUT ARTISTS (50 sample) ===')
  console.log('Title | Extracted Artists')
  console.log('------|-------------------')
  for (const e of eventsWithoutArtists) {
    const extracted = extractArtistNames(e.title)
    console.log(`${e.title} | ${extracted.length > 0 ? extracted.join(' / ') : '(none)'}`)
  }

  // Get events WITH artists to see what patterns worked
  const eventsWithArtists = await prisma.event.findMany({
    where: {
      isMusic: true,
      eventArtists: { some: {} },
      startsAt: { gte: new Date() }
    },
    select: {
      title: true,
      eventArtists: {
        select: { artist: { select: { name: true } } },
        orderBy: { order: 'asc' }
      }
    },
    orderBy: { startsAt: 'asc' },
    take: 30
  })

  console.log('\n=== EVENTS WITH ARTISTS (30 sample) ===')
  console.log('Title => [Linked Artists]')
  console.log('--------------------------')
  for (const e of eventsWithArtists) {
    const artists = e.eventArtists.map(ea => ea.artist.name).join(', ')
    console.log(`${e.title} => [${artists}]`)
  }

  // Analyze failed extractions by checking titles that look like they have artists
  const failedExtractions = eventsWithoutArtists.filter(e => {
    const extracted = extractArtistName(e.title)
    // Title has meaningful content but we couldn't extract
    return !extracted && e.title.length > 10 && !/open mic|jam session|karaoke|trivia|comedy/i.test(e.title)
  })

  console.log('\n=== POTENTIAL EXTRACTION FAILURES ===')
  console.log('These titles likely have artist names but extraction failed:')
  for (const e of failedExtractions.slice(0, 20)) {
    console.log(`  - ${e.title}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(console.error)
