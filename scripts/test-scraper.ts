import 'dotenv/config'
import { IronHorseScraper } from '../server/scrapers/venues/iron-horse'

async function main() {
  console.log('Testing Iron Horse scraper...\n')

  const scraper = new IronHorseScraper()
  const result = await scraper.scrape()

  console.log('\n=== SCRAPE RESULT ===')
  console.log(`Success: ${result.success}`)
  console.log(`Duration: ${result.duration}ms`)
  console.log(`Events found: ${result.events.length}`)

  if (result.errors.length > 0) {
    console.log('\nErrors:')
    result.errors.forEach((err) => console.log(`  - ${err}`))
  }

  if (result.events.length > 0) {
    console.log('\nEvents:')
    result.events.forEach((event, i) => {
      console.log(`\n${i + 1}. ${event.title}`)
      console.log(`   Date: ${event.startsAt.toLocaleDateString()} ${event.startsAt.toLocaleTimeString()}`)
      if (event.coverCharge) console.log(`   Price: ${event.coverCharge}`)
      if (event.artists?.length) {
        console.log(`   Artists: ${event.artists.map((a) => a.name).join(', ')}`)
      }
      console.log(`   URL: ${event.sourceUrl}`)
    })
  }
}

main().catch(console.error)
