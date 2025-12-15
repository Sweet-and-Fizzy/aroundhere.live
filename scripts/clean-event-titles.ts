/**
 * Migration script to clean event titles that have date prefixes and time suffixes
 *
 * This script finds events with titles like:
 *   "Saturday December 20th - Event Name"
 *   "Open Mic 7-10 (Sign-Up @ 6)"
 *
 * And cleans them to:
 *   "Event Name"
 *   "Open Mic"
 *
 * Usage:
 *   npx tsx scripts/clean-event-titles.ts [--dry-run] [--venue "Venue Name"]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Clean event title by removing date prefixes and time suffixes
 */
function cleanTitle(title: string): string {
  return title
    // Remove date prefixes like "Saturday December 20th - " or "Friday, January 3rd - "
    .replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\s*[-–—]\s*/i, '')
    // Remove time ranges like "7-10", "7-8:30", "8:30-11pm", "7pm-10pm"
    .replace(/,?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*-\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
    // Remove standalone times like "7pm", "8:30pm"
    .replace(/,?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, '')
    // Remove parenthetical notes about times like "(Sign-Up @ 6)"
    .replace(/\s*\([^)]*(?:sign[- ]?up|@|\d{1,2}(?::\d{2})?(?:am|pm)?)[^)]*\)/gi, '')
    // Clean up trailing punctuation and whitespace
    .replace(/[,\s]+$/, '')
    .trim()
}

/**
 * Generate URL-safe slug from text
 */
function generateSlug(text: string, date: Date): string {
  let slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  const dateStr = date.toISOString().split('T')[0]
  return `${slug}-${dateStr}`
}

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const venueIndex = args.indexOf('--venue')
  const venueName = venueIndex >= 0 ? args[venueIndex + 1] : undefined

  console.log('🔍 Finding events with titles that need cleaning...\n')

  // Build where clause
  const where: any = {
    startsAt: { gte: new Date() }, // Only future events
  }

  if (venueName) {
    where.venue = {
      name: {
        contains: venueName,
        mode: 'insensitive',
      },
    }
    console.log(`   Filtering by venue: "${venueName}"`)
  }

  // Find all future events
  const events = await prisma.event.findMany({
    where,
    include: {
      venue: true,
    },
    orderBy: {
      startsAt: 'asc',
    },
  })

  console.log(`   Found ${events.length} future events\n`)

  const updates: Array<{ id: string; oldTitle: string; newTitle: string; venue: string }> = []

  for (const event of events) {
    const cleanedTitle = cleanTitle(event.title)

    // Only update if the title actually changed
    if (cleanedTitle !== event.title && cleanedTitle.length > 0) {
      updates.push({
        id: event.id,
        oldTitle: event.title,
        newTitle: cleanedTitle,
        venue: event.venue?.name || 'Unknown',
      })
    }
  }

  if (updates.length === 0) {
    console.log('✅ No titles need cleaning!')
    return
  }

  console.log(`📝 Found ${updates.length} titles that need cleaning:\n`)

  // Group by venue for better display
  const byVenue = updates.reduce((acc, update) => {
    if (!acc[update.venue]) {
      acc[update.venue] = []
    }
    acc[update.venue].push(update)
    return acc
  }, {} as Record<string, typeof updates>)

  for (const [venue, venueUpdates] of Object.entries(byVenue)) {
    console.log(`\n${venue} (${venueUpdates.length} events):`)
    for (const update of venueUpdates.slice(0, 5)) {
      console.log(`  "${update.oldTitle}"`)
      console.log(`  → "${update.newTitle}"\n`)
    }
    if (venueUpdates.length > 5) {
      console.log(`  ... and ${venueUpdates.length - 5} more\n`)
    }
  }

  if (isDryRun) {
    console.log('\n🔍 DRY RUN - No changes made')
    console.log(`   Run without --dry-run to apply these ${updates.length} changes`)
    return
  }

  console.log(`\n✍️  Updating ${updates.length} event titles...\n`)

  let updated = 0
  for (const update of updates) {
    try {
      const event = events.find(e => e.id === update.id)!
      const newSlug = generateSlug(update.newTitle, event.startsAt)

      await prisma.event.update({
        where: { id: update.id },
        data: {
          title: update.newTitle,
          slug: newSlug,
          updatedAt: new Date(),
        },
      })
      updated++

      if (updated % 10 === 0) {
        console.log(`   Updated ${updated}/${updates.length} events...`)
      }
    } catch (error) {
      console.error(`   ❌ Error updating event ${update.id}:`, error)
    }
  }

  console.log(`\n✅ Successfully updated ${updated} event titles!`)
}

main()
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
