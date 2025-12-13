/**
 * Test script for the Fame scraper
 * Run with: npx tsx scripts/test-fame-scraper.ts
 */

import { FameScraper } from '../server/scrapers/venues/fame'

async function main() {
  console.log('Testing Fame scraper...\n')

  const scraper = new FameScraper()

  try {
    const result = await scraper.scrape()

    console.log('\n=== SCRAPER RESULT ===')
    console.log(`Success: ${result.success}`)
    console.log(`Duration: ${result.duration}ms`)
    console.log(`Events found: ${result.events.length}`)

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`)
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`)
      })
    }

    if (result.events.length > 0) {
      console.log('\n=== EVENTS ===')
      result.events.forEach((event, i) => {
        console.log(`\n${i + 1}. ${event.title}`)
        console.log(`   Date: ${event.startsAt.toLocaleString('en-US', { timeZone: 'America/New_York' })}`)
        if (event.endsAt) {
          console.log(`   Ends: ${event.endsAt.toLocaleString('en-US', { timeZone: 'America/New_York' })}`)
        }
        if (event.description) {
          console.log(`   Description: ${event.description.substring(0, 100)}${event.description.length > 100 ? '...' : ''}`)
        }
        if (event.coverCharge) {
          console.log(`   Price: ${event.coverCharge}`)
        }
        if (event.ticketUrl) {
          console.log(`   Tickets: ${event.ticketUrl}`)
        }
        if (event.imageUrl) {
          console.log(`   Image: ${event.imageUrl}`)
        }
        console.log(`   Source ID: ${event.sourceEventId}`)
      })
    }

    console.log('\n=== TEST COMPLETE ===\n')
  } catch (error) {
    console.error('Error running scraper:', error)
    process.exit(1)
  }
}

main()
