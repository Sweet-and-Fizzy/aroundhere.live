import 'dotenv/config'
import { MarigoldScraper } from '../server/scrapers/venues/marigold'
import { ProgressionBrewingScraper } from '../server/scrapers/venues/progression-brewing'
import { ParlorRoomScraper } from '../server/scrapers/venues/parlor-room'
import { runScraper, cleanup } from '../server/scrapers/runner'

async function testScraper(name: string, scraper: any) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Testing ${name} scraper...`)
  console.log('='.repeat(60))

  // Use runScraper instead of scraper.scrape() directly
  // This ensures failure detection and notifications are triggered
  const runnerResult = await runScraper(scraper)
  const result = runnerResult.result

  console.log(`\n=== SCRAPE RESULT ===`)
  console.log(`Success: ${result.success}`)
  console.log(`Duration: ${result.duration}ms`)
  console.log(`Events found: ${result.events.length}`)
  console.log(`Events saved: ${runnerResult.savedEvents}`)
  console.log(`Events skipped: ${runnerResult.skippedEvents}`)

  if (result.errors.length > 0) {
    console.log('\nErrors:')
    result.errors.forEach((err: string) => console.log(`  - ${err}`))
  }

  if (result.events.length > 0) {
    console.log('\nEvents:')
    result.events.slice(0, 5).forEach((event: any, i: number) => {
      console.log(`\n${i + 1}. ${event.title}`)
      console.log(`   Date: ${event.startsAt.toLocaleDateString()} ${event.startsAt.toLocaleTimeString()}`)
      if (event.coverCharge) console.log(`   Price: ${event.coverCharge}`)
      console.log(`   URL: ${event.sourceUrl}`)
    })
    if (result.events.length > 5) {
      console.log(`\n... and ${result.events.length - 5} more events`)
    }
  } else {
    console.log('\n⚠️  No events found!')
    console.log('💡 If this is unexpected, you should see a failure notification above!')
  }
}

async function main() {
  try {
    await testScraper('Marigold', new MarigoldScraper())
    await testScraper('Progression Brewing', new ProgressionBrewingScraper())
    await testScraper('Parlor Room', new ParlorRoomScraper())
  } finally {
    await cleanup()
  }
}

main().catch(console.error)

