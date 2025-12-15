import { IronHorseScraper } from '../server/scrapers/venues/iron-horse'

async function testIronHorse() {
  console.log('Testing Iron Horse Music Hall scraper...\n')

  const scraper = new IronHorseScraper()

  try {
    const result = await scraper.scrape()
    const events = result.events

    console.log(`\n✅ Found ${events.length} events\n`)

    // Show first 5 events
    events.slice(0, 5).forEach((event, i) => {
      console.log(`Event ${i + 1}:`)
      console.log(`  Title: ${event.title}`)
      console.log(`  Date: ${event.startsAt}`)
      console.log(`  Price: ${event.coverCharge || 'N/A'}`)
      console.log(`  URL: ${event.sourceUrl}`)
      if (event.genres?.length) {
        console.log(`  Genres: ${event.genres.join(', ')}`)
      }
      console.log()
    })

    if (events.length > 5) {
      console.log(`... and ${events.length - 5} more events`)
    }
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

testIronHorse()
