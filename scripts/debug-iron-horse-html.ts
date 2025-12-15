import { chromium } from 'playwright'
import { load } from 'cheerio'

async function debugIronHorse() {
  console.log('Debugging Iron Horse scraper HTML parsing...\n')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    console.log('Navigating to calendar page...')
    await page.goto('https://ironhorse.org/calendar', { waitUntil: 'networkidle' })

    console.log('Waiting for content to load...')
    await page.waitForTimeout(5000)

    // Get the HTML
    const html = await page.content()

    // Parse with cheerio (same as scraper)
    const $ = load(html)

    // Check for event elements
    const eventElements = $('.eapp-events-calendar-masonry-item')
    console.log(`Found ${eventElements.length} events with cheerio`)

    if (eventElements.length > 0) {
      console.log('\nFirst event data:')
      const $el = $(eventElements[0])
      const title = $el.find('.eapp-events-calendar-masonry-item-name').text().trim()
      const dateText = $el.find('.eapp-events-calendar-date-element-component').text().trim()
      const timeText = $el.find('.eapp-events-calendar-time-text').text().trim()
      const category = $el.find('.eapp-events-calendar-category-item').text().trim()
      const priceCaption = $el.find('.eapp-events-calendar-button-element-caption').text().trim()

      console.log(`  Title: ${title}`)
      console.log(`  Date: ${dateText}`)
      console.log(`  Time: ${timeText}`)
      console.log(`  Category: ${category}`)
      console.log(`  Price: ${priceCaption}`)

      // Check the outer HTML
      const outerHTML = $.html($el)
      console.log(`\nOuter HTML length: ${outerHTML.length} chars`)
      console.log(`First 500 chars: ${outerHTML.substring(0, 500)}`)
    } else {
      console.log('\n❌ No events found with cheerio!')
      console.log('Checking if widget container exists...')
      const widgetContainer = $('#eapps-event-calendar-b0bd4277-11aa-4ae8-9f35-fc260b996a4e')
      console.log(`Widget container found: ${widgetContainer.length > 0}`)

      if (widgetContainer.length > 0) {
        console.log(`Widget HTML length: ${widgetContainer.html()?.length || 0}`)
      }
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await browser.close()
  }
}

debugIronHorse()
