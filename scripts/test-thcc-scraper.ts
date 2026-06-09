/**
 * Manually run the THCC scraper against the live site and print parsed events.
 * Usage: npx tsx scripts/test-thcc-scraper.ts
 */
import 'dotenv/config'
import { TheHeavyCultureCoopScraper } from '../server/scrapers/venues/the-heavy-culture-coop'

async function main() {
  const scraper = new TheHeavyCultureCoopScraper()
  const result = await scraper.scrape()

  console.log(`\nsuccess: ${result.success}  events: ${result.events.length}  errors: ${result.errors.length}`)
  if (result.errors.length) console.log('errors:', result.errors)

  for (const e of result.events) {
    console.log(`\n  ${e.title}`)
    console.log(`    starts: ${e.startsAt.toISOString()}`)
    console.log(`    ends:   ${e.endsAt ? e.endsAt.toISOString() : '(none)'}`)
    console.log(`    url:    ${e.sourceUrl}`)
    console.log(`    id:     ${e.sourceEventId}`)
    console.log(`    age:    ${e.ageRestriction ?? '(none)'}`)
    console.log(`    cover:  ${e.coverCharge ?? '(none)'}`)
    console.log(`    image:  ${e.imageUrl ? e.imageUrl.slice(0, 70) + '...' : '(none)'}`)
    console.log(`    desc:   ${e.description ? e.description.replace(/\n/g, ' ').slice(0, 90) + '...' : '(none)'}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
