import 'dotenv/config'
import { ProgressionBrewingScraper } from '../server/scrapers/venues/progression-brewing'
import { ParlorRoomScraper } from '../server/scrapers/venues/parlor-room'
import { DeLaLuzScraper } from '../server/scrapers/venues/de-la-luz'
import type { BaseScraper, ScrapedEvent } from '../server/scrapers/types'

async function checkFields(name: string, scraper: BaseScraper) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Checking ${name} scraper fields...`)
  console.log('='.repeat(60))

  const result = await scraper.scrape()

  console.log(`\nFound ${result.events.length} events\n`)

  if (result.events.length > 0) {
    // Check first 3 events in detail
    result.events.slice(0, 3).forEach((event: ScrapedEvent, i: number) => {
      console.log(`\nEvent ${i + 1}: ${event.title}`)
      console.log(`  ✓ title: ${event.title ? '✓' : '✗'}`)
      console.log(`  ✓ startsAt: ${event.startsAt ? event.startsAt.toISOString() : '✗'}`)
      console.log(`  ✓ endsAt: ${event.endsAt ? event.endsAt.toISOString() : '✗'}`)
      console.log(`  ✓ doorsAt: ${event.doorsAt ? event.doorsAt.toISOString() : '✗'}`)
      console.log(`  ✓ description: ${event.description ? `✓ (${event.description.length} chars)` : '✗'}`)
      console.log(`  ✓ descriptionHtml: ${event.descriptionHtml ? `✓ (${event.descriptionHtml.length} chars)` : '✗'}`)
      console.log(`  ✓ imageUrl: ${event.imageUrl ? event.imageUrl : '✗'}`)
      console.log(`  ✓ sourceUrl: ${event.sourceUrl ? event.sourceUrl : '✗'}`)
      console.log(`  ✓ sourceEventId: ${event.sourceEventId ? event.sourceEventId : '✗'}`)
      console.log(`  ✓ coverCharge: ${event.coverCharge ? event.coverCharge : '✗'}`)
      console.log(`  ✓ ticketUrl: ${event.ticketUrl ? event.ticketUrl : '✗'}`)
      console.log(`  ✓ artists: ${event.artists ? `✓ (${event.artists.length})` : '✗'}`)
      console.log(`  ✓ genres: ${event.genres ? `✓ (${event.genres.join(', ')})` : '✗'}`)
    })

    // Summary
    const total = result.events.length
    const withDescription = result.events.filter((e) => e.description).length
    const withImage = result.events.filter((e) => e.imageUrl).length
    const withPrice = result.events.filter((e) => e.coverCharge).length
    const withArtists = result.events.filter((e) => e.artists && e.artists.length > 0).length

    console.log(`\n--- Summary (${total} events) ---`)
    console.log(`  Description: ${withDescription}/${total} (${Math.round(withDescription/total*100)}%)`)
    console.log(`  Image: ${withImage}/${total} (${Math.round(withImage/total*100)}%)`)
    console.log(`  Price: ${withPrice}/${total} (${Math.round(withPrice/total*100)}%)`)
    console.log(`  Artists: ${withArtists}/${total} (${Math.round(withArtists/total*100)}%)`)
  } else {
    console.log('⚠️  No events found!')
  }
}

async function main() {
  await checkFields('Progression Brewing', new ProgressionBrewingScraper())
  await checkFields('Parlor Room', new ParlorRoomScraper())
  await checkFields('De La Luz', new DeLaLuzScraper())
}

main().catch(console.error)

