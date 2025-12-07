/**
 * Test script to experiment with HTML stripping for scraper prompts
 * Run with: npx tsx scripts/test-html-stripping.ts <url>
 */

import { chromium } from 'playwright'
import sanitizeHtml from 'sanitize-html'
import * as cheerio from 'cheerio'

interface ProcessedHtml {
  ldJson: object[]
  strippedHtml: string
  totalSize: number
}

function processHtmlForLlm(html: string, maxHtmlSize = 30000): ProcessedHtml {
  const $ = cheerio.load(html)

  // 1. Extract LD+JSON (these are compact and valuable)
  const ldJson: object[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '')
      // Only include Event types or arrays that might contain events
      if (data['@type'] === 'Event' || Array.isArray(data)) {
        ldJson.push(data)
      }
    } catch {
      // Ignore parse errors
    }
  })

  // 2. Try to find the main event content area (not the whole page)
  // Priority order: most specific to least specific
  const contentSelectors = [
    // Squarespace
    '.eventlist',
    '.sqs-block-calendar',
    // Common event patterns
    '.event-list',
    '.events-list',
    '.event-calendar',
    '.calendar-events',
    // Broader patterns - but must have multiple matches to be useful
    // '[class*="event"]', // Too broad, matches single event or unrelated
    // Generic content areas (fallback)
    'main',
    'article',
    '[role="main"]',
    '#content',
    '.content',
    'body',
  ]

  let contentHtml = html
  for (const selector of contentSelectors) {
    const el = $(selector).first()
    if (el.length > 0) {
      const elHtml = el.html()
      if (elHtml && elHtml.length > 1000) { // Must have some content
        contentHtml = elHtml
        console.log(`Using content from: ${selector} (${(elHtml.length / 1024).toFixed(1)}KB)`)
        break
      }
    }
  }

  // 3. Strip HTML using sanitize-html
  let strippedHtml = sanitizeHtml(contentHtml, {
    allowedTags: [
      'div', 'span', 'section', 'article', 'main', 'aside',
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br',
      'ul', 'ol', 'li',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'time',
    ],
    allowedAttributes: {
      '*': ['class', 'id'],
      'a': ['href'],
      'img': ['src', 'alt'],
      'time': ['datetime'],
    },
    allowedStyles: {},
    exclusiveFilter: (frame) => {
      return ['script', 'style', 'svg', 'noscript', 'nav', 'footer', 'header', 'iframe'].includes(frame.tag)
    },
  })

  // 4. Additional cleanup
  strippedHtml = strippedHtml
    .replace(/\s+data-[a-z0-9-]+="[^"]*"/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/<(\w+)(\s[^>]*)?>(\s*)<\/\1>/g, '')
    .trim()

  // 5. Truncate HTML if needed (LD+JSON gets priority)
  const ldJsonSize = JSON.stringify(ldJson).length
  const availableForHtml = Math.max(0, maxHtmlSize - ldJsonSize)

  if (strippedHtml.length > availableForHtml) {
    strippedHtml = strippedHtml.substring(0, availableForHtml) + '\n[HTML truncated...]'
  }

  return {
    ldJson,
    strippedHtml,
    totalSize: ldJsonSize + strippedHtml.length,
  }
}

async function fetchAndAnalyze(url: string) {
  console.log(`Fetching: ${url}\n`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  const html = await page.content()
  await browser.close()

  console.log(`Original HTML: ${html.length} bytes (${(html.length / 1024).toFixed(1)} KB)`)

  const result = processHtmlForLlm(html)

  console.log(`\n--- Results ---`)
  console.log(`LD+JSON events found: ${result.ldJson.length}`)
  console.log(`LD+JSON size: ${(JSON.stringify(result.ldJson).length / 1024).toFixed(1)} KB`)
  console.log(`Stripped HTML size: ${(result.strippedHtml.length / 1024).toFixed(1)} KB`)
  console.log(`Total size: ${(result.totalSize / 1024).toFixed(1)} KB`)
  console.log(`Compression: ${((1 - result.totalSize / html.length) * 100).toFixed(1)}% reduction`)

  if (result.ldJson.length > 0) {
    console.log(`\n--- LD+JSON Sample (first event) ---`)
    console.log(JSON.stringify(result.ldJson[0], null, 2).substring(0, 1000))
  }

  console.log(`\n--- HTML Sample (first 2000 chars) ---`)
  console.log(result.strippedHtml.substring(0, 2000))
}

const url = process.argv[2]
if (!url) {
  console.log('Usage: npx tsx scripts/test-html-stripping.ts <url>')
  process.exit(1)
}

fetchAndAnalyze(url).catch(console.error)
