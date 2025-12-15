import { chromium } from 'playwright'
import { load } from 'cheerio'

async function debugScraperFlow() {
  console.log('Debugging Iron Horse scraper exact flow...\n')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    // Step 1: Navigate
    console.log('Step 1: Navigating...')
    await page.goto('https://ironhorse.org/calendar', { waitUntil: 'networkidle' })
    console.log('  ✅ Navigation complete')

    // Step 2: waitForContent (UPDATED VERSION)
    console.log('\nStep 2: Running waitForContent()...')
    try {
      await page.waitForSelector('.eapp-events-calendar-masonry-item', {
        timeout: 15000,
      })
      console.log('  ✅ Selector found')
      // Give it extra time to ensure all events are rendered
      await page.waitForTimeout(2000)
      console.log('  ✅ Waited additional 2s')
    } catch {
      console.log('  ❌ Selector not found within 15s')
      // If specific selectors don't appear, wait longer
      await page.waitForTimeout(8000)
      console.log('  ⏱️  Waited fallback 8s')
    }

    // Step 3: Get HTML
    console.log('\nStep 3: Getting HTML...')
    const html = await page.content()
    console.log(`  HTML length: ${html.length} chars`)

    // Step 4: Parse with cheerio
    console.log('\nStep 4: Parsing with cheerio...')
    const $ = load(html)
    const eventElements = $('.eapp-events-calendar-masonry-item')
    console.log(`  Found ${eventElements.length} events`)

    if (eventElements.length > 0) {
      console.log('\n✅ SUCCESS! Events found.')
      const $el = $(eventElements[0])
      const title = $el.find('.eapp-events-calendar-masonry-item-name').text().trim()
      console.log(`  First event: ${title}`)
    } else {
      console.log('\n❌ FAILURE! No events found.')
      // Debug: check if widget container exists
      const widgetId = 'eapps-event-calendar-b0bd4277-11aa-4ae8-9f35-fc260b996a4e'
      const widgetExists = $(`#${widgetId}`).length > 0
      console.log(`  Widget container exists in HTML: ${widgetExists}`)

      if (widgetExists) {
        const widgetHTML = $(`#${widgetId}`).html() || ''
        console.log(`  Widget HTML length: ${widgetHTML.length}`)
        console.log(`  Widget HTML preview: ${widgetHTML.substring(0, 200)}`)
      }
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await browser.close()
  }
}

debugScraperFlow()
