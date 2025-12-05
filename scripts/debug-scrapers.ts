import 'dotenv/config'
import { chromium } from 'playwright'

async function debugSite(name: string, url: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Debugging ${name}: ${url}`)
  console.log('='.repeat(60))

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(3000) // Wait for JS to load

    // Get all links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => ({
          href: a.href,
          text: a.textContent?.trim().slice(0, 50),
          classes: a.className
        }))
        .filter(a => a.href && !a.href.includes('#'))
    })

    console.log(`\nFound ${links.length} total links`)
    
    // Filter for event-like links
    const eventLinks = links.filter(l => 
      l.href.includes('event') || 
      l.href.includes('product') || 
      l.href.includes('show') ||
      l.href.includes('performance')
    )

    console.log(`\nEvent-like links (${eventLinks.length}):`)
    eventLinks.slice(0, 10).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.href}`)
      console.log(`     Text: ${l.text}`)
      console.log(`     Classes: ${l.classes}`)
    })

    // Check for specific selectors
    const selectors = [
      '#fooevents-event-listing-list',
      '.fooevents-event-listing-list-container',
      '.tribe-events-calendar-list__event',
      '.tribe-events-list__event',
      'a[href*="/shows-events/"]',
      'a[href*="/upcoming-shows/"]',
      'a[href*="/events/"]',
      '[data-type="event"]',
      '.event',
      '.event-item'
    ]

    console.log(`\nChecking selectors:`)
    for (const selector of selectors) {
      const count = await page.$$eval(selector, els => els.length)
      if (count > 0) {
        console.log(`  ✓ ${selector}: ${count} elements`)
      }
    }

    // Check for LD+JSON
    const ldJson = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      return scripts.map(s => {
        try {
          return JSON.parse(s.textContent || '')
        } catch {
          return null
        }
      }).filter(Boolean)
    })

    if (ldJson.length > 0) {
      console.log(`\nFound ${ldJson.length} LD+JSON scripts`)
      ldJson.forEach((data: Record<string, unknown>, i: number) => {
        if (data['@type'] === 'Event' || data['@type'] === 'MusicEvent') {
          console.log(`  Event ${i + 1}: ${data.name || 'Unknown'}`)
          console.log(`    Date: ${data.startDate || 'Unknown'}`)
        }
      })
    }

    // Get page HTML snippet
    const bodyText = await page.textContent('body')
    const eventKeywords = ['event', 'show', 'concert', 'performance', 'ticket']
    const keywordCounts = eventKeywords.map(kw => ({
      keyword: kw,
      count: (bodyText?.toLowerCase().match(new RegExp(kw, 'g')) || []).length
    }))
    
    console.log(`\nKeyword counts in page text:`)
    keywordCounts.forEach(kc => {
      if (kc.count > 0) {
        console.log(`  ${kc.keyword}: ${kc.count}`)
      }
    })

  } catch (error) {
    console.error(`Error:`, error)
  } finally {
    await browser.close()
  }
}

async function main() {
  await debugSite('Marigold', 'https://marigold.org/events')
  await debugSite('Progression Brewing', 'https://progressionbrewing.com/events/')
  await debugSite('Parlor Room', 'https://www.parlorroom.org/shows-events')
}

main().catch(console.error)

