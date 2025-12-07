/**
 * Find where actual event content lives in the HTML
 */

import { chromium } from 'playwright'
import * as cheerio from 'cheerio'

async function test(url: string) {
  console.log(`Fetching: ${url}\n`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  const html = await page.content()
  await browser.close()

  const $ = cheerio.load(html)

  // Look for common event-related selectors
  const selectors = [
    // Generic
    'main',
    'article',
    '[role="main"]',
    '#content',
    '.content',
    // Event-specific
    '.eventlist',
    '.event-list',
    '.events',
    '[class*="event"]',
    '[class*="calendar"]',
    // Squarespace specific
    '.sqs-block-calendar',
    '.eventlist-event',
    '.summary-item',
    // Time elements (events usually have dates)
    'time',
    '[datetime]',
  ]

  console.log('Searching for event containers:\n')

  for (const sel of selectors) {
    const el = $(sel)
    if (el.length > 0) {
      // Get text content to see if it looks like events
      const textSample = el.first().text().replace(/\s+/g, ' ').trim().substring(0, 200)
      const htmlLen = (el.first().html() || '').length

      console.log(`${sel}:`)
      console.log(`  Count: ${el.length}, HTML size: ${(htmlLen / 1024).toFixed(1)}KB`)
      console.log(`  Text: "${textSample}"`)
      console.log()
    }
  }

  // Also look for links that might be event detail pages
  console.log('\n--- Links that might be events ---')
  const eventLinks = $('a[href*="/event"], a[href*="/show"], a[href*="/calendar"]')
  console.log(`Found ${eventLinks.length} potential event links`)
  eventLinks.slice(0, 5).each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim().substring(0, 50)
    console.log(`  ${href} - "${text}"`)
  })
}

const url = process.argv[2] || 'https://www.thedrakeamherst.org/events'
test(url).catch(console.error)
