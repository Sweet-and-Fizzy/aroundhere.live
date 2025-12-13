/**
 * Check for LD+JSON structured data on event pages
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

  const ldJsonScripts = $('script[type="application/ld+json"]')
  console.log(`Found ${ldJsonScripts.length} LD+JSON scripts\n`)

  ldJsonScripts.each((i, el) => {
    const content = $(el).html()
    if (!content) return

    try {
      const data = JSON.parse(content)
      const preview = JSON.stringify(data, null, 2).substring(0, 2000)
      console.log(`--- LD+JSON #${i + 1} (${content.length} bytes) ---`)
      console.log(`Type: ${data['@type'] || (Array.isArray(data) ? 'Array' : 'Object')}`)
      console.log(`Preview:\n${preview}`)
      console.log('\n')
    } catch {
      console.log(`--- LD+JSON #${i + 1} (parse error) ---`)
      console.log(content.substring(0, 500))
      console.log('\n')
    }
  })
}

const url = process.argv[2] || 'https://www.thedrakeamherst.org/events'
test(url).catch(console.error)
