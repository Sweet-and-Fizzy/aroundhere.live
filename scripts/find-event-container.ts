/**
 * Find the main event container in a page
 */

import { chromium } from 'playwright'
import * as cheerio from 'cheerio'

async function test(url: string) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const html = await page.content()
  await browser.close()

  const $ = cheerio.load(html)

  // Try to find main content area
  const candidates = [
    'main',
    '[role="main"]',
    '#page',
    'article',
    '.eventlist',
    '[class*="event"]',
    '[class*="calendar"]',
    '[class*="content"]',
  ]

  console.log('Searching for content containers:\n')

  for (const sel of candidates) {
    const el = $(sel)
    if (el.length) {
      const firstHtml = el.first().html() || ''
      console.log(`${sel}: ${el.length} matches, html length: ${(firstHtml.length / 1024).toFixed(1)}KB`)
    }
  }
}

const url = process.argv[2] || 'https://www.thedrakeamherst.org/events'
test(url).catch(console.error)
