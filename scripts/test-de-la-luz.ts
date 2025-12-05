import 'dotenv/config'
import { DeLaLuzScraper } from '../server/scrapers/venues/de-la-luz'
import { runScraper, cleanup } from '../server/scrapers/runner'
import type { ScrapedEvent } from '../server/scrapers/types'

async function main() {
  try {
    console.log('\n' + '='.repeat(60))
    console.log('Testing De La Luz scraper...')
    console.log('='.repeat(60))

    const scraper = new DeLaLuzScraper()
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
      result.events.forEach((event: ScrapedEvent, i: number) => {
        console.log(`\n${i + 1}. ${event.title}`)
        console.log(`   Date: ${event.startsAt.toLocaleDateString()} ${event.startsAt.toLocaleTimeString()}`)
        if (event.coverCharge) console.log(`   Price: ${event.coverCharge}`)
        console.log(`   URL: ${event.sourceUrl}`)
        console.log(`   ID: ${event.sourceEventId}`)
      })
    } else {
      console.log('\n⚠️  No events found!')
    }
  } finally {
    await cleanup()
  }
}

main().catch(console.error)

