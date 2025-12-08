/**
 * Extract artists from event titles and create artist records
 *
 * Focuses on clean, obvious artist names - skips messy multi-artist titles.
 *
 * Usage: npx tsx scripts/extract-artists.ts [--dry-run]
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function extractArtistName(title: string): string | null {
  // Skip titles with multiple artists (slashes indicate local multi-band shows)
  if ((title.match(/\//g) || []).length > 0) return null
  if ((title.match(/\|/g) || []).length > 0) return null

  // Skip if starts with number (like "5Rhythms")
  if (/^\d+/.test(title)) return null

  // Skip if contains emoji
  if (/[\u{1F300}-\u{1F9FF}]/u.test(title)) return null

  let artist = title.trim()

  // Handle "Live Music: X" or "LIVE Music - X" pattern
  const liveMusicMatch = artist.match(/^live\s+music[:\s-]+\s*(.+)$/i)
  if (liveMusicMatch) {
    artist = liveMusicMatch[1].trim()
  }

  // Handle "An Evening with X" pattern
  const eveningMatch = artist.match(/^an evening with\s+(.+?)(\s*\(.*\))?$/i)
  if (eveningMatch) {
    artist = eveningMatch[1].trim()
  }

  // Handle "X - w/ Y" pattern (take headliner only)
  const wMatch = artist.match(/^(.+?)\s+-\s+w\/\s+/i)
  if (wMatch) {
    artist = wMatch[1].trim()
  }

  // Strip time suffixes like "7-8pm", "9:30pm", "8-9:30pm"
  artist = artist.replace(/,?\s*\d{1,2}(:\d{2})?\s*-?\s*\d{0,2}(:\d{2})?\s*(am|pm)?$/i, '')

  // Skip if still contains "w/" (nested openers)
  if (/\sw\/\s/i.test(artist)) return null

  // Skip if too short or too long
  artist = artist.trim()
  if (artist.length < 3 || artist.length > 80) return null

  // Skip if it looks like a sentence (too many words)
  const wordCount = artist.split(/\s+/).length
  if (wordCount > 8) return null

  return artist
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  console.log(dryRun ? '🔍 DRY RUN - No changes will be made\n' : '🚀 Extracting artists from events...\n')

  // Get all events
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { isMusic: true },
        { isMusic: null },
      ],
    },
    select: {
      id: true,
      title: true,
      eventArtists: {
        select: { artistId: true }
      }
    },
    orderBy: { title: 'asc' }
  })

  console.log(`Found ${events.length} potential music events\n`)

  // Extract artists
  const artistMap = new Map<string, { name: string; slug: string; eventIds: string[] }>()
  let skipped = 0
  let alreadyLinked = 0

  for (const event of events) {
    if (event.eventArtists.length > 0) {
      alreadyLinked++
      continue
    }

    const artistName = extractArtistName(event.title)

    if (!artistName) {
      skipped++
      continue
    }

    const slug = slugify(artistName)
    if (!slug || slug.length < 2) {
      skipped++
      continue
    }

    if (artistMap.has(slug)) {
      artistMap.get(slug)!.eventIds.push(event.id)
    } else {
      artistMap.set(slug, {
        name: artistName,
        slug,
        eventIds: [event.id]
      })
    }
  }

  const sortedArtists = Array.from(artistMap.values())
    .sort((a, b) => b.eventIds.length - a.eventIds.length)

  console.log(`Skipped ${skipped} messy/non-music events`)
  console.log(`${alreadyLinked} events already have artists linked`)
  console.log(`\nExtracted ${sortedArtists.length} artists:\n`)

  for (const artist of sortedArtists) {
    console.log(`  ${artist.name} (${artist.eventIds.length} events)`)
  }

  if (dryRun) {
    console.log('\n✋ Dry run complete. Run without --dry-run to create records.')
    await prisma.$disconnect()
    return
  }

  console.log('\n📝 Creating artist records...\n')

  let created = 0
  let linked = 0

  for (const extracted of sortedArtists) {
    // Check if artist already exists
    let artist = await prisma.artist.findUnique({
      where: { slug: extracted.slug }
    })

    if (!artist) {
      artist = await prisma.artist.create({
        data: {
          name: extracted.name,
          slug: extracted.slug,
          spotifyMatchStatus: 'PENDING',
        }
      })
      created++
      console.log(`✅ Created: ${extracted.name}`)
    }

    // Link to events
    for (const eventId of extracted.eventIds) {
      try {
        await prisma.eventArtist.create({
          data: {
            eventId,
            artistId: artist.id,
            order: 1,
          }
        })
        linked++
      } catch {
        // Already linked, skip
      }
    }
  }

  console.log(`\n✨ Done!`)
  console.log(`   Created ${created} new artists`)
  console.log(`   Created ${linked} event-artist links`)

  await prisma.$disconnect()
}

main().catch(console.error)
