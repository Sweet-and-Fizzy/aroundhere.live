import { chromium } from 'playwright'

async function debugIronHorse() {
  console.log('Debugging Iron Horse calendar page...\n')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    console.log('Navigating to calendar page...')
    await page.goto('https://ironhorse.org/calendar', { waitUntil: 'networkidle' })

    console.log('Waiting for content to load...')
    await page.waitForTimeout(5000)

    // Check for various possible selectors
    const selectors = [
      '.eapp-events-calendar-masonry-item', // Old Elfsight
      '.squarespace-calendar-block-renderer', // Squarespace calendar
      '.calendar-event',
      '.event-item',
      '.eventlist-event',
      '.summary-item',
      '[data-event-id]',
      '[class*="calendar"]',
      '[class*="event"]',
    ]

    console.log('\nChecking for event elements...\n')
    for (const selector of selectors) {
      const count = await page.locator(selector).count()
      if (count > 0) {
        console.log(`✅ Found ${count} elements matching: ${selector}`)

        // Get the HTML of the first matching element
        const firstElement = page.locator(selector).first()
        const html = await firstElement.innerHTML().catch(() => '')
        if (html) {
          console.log(`  Sample HTML (first 500 chars):`)
          console.log(`  ${html.substring(0, 500)}...\n`)
        }
      } else {
        console.log(`❌ No elements found for: ${selector}`)
      }
    }

    // Save the full rendered HTML for inspection
    const html = await page.content()
    const fs = await import('fs/promises')
    await fs.writeFile('/tmp/iron-horse-debug.html', html)
    console.log('\n💾 Full HTML saved to /tmp/iron-horse-debug.html')

    // Look for calendar container
    console.log('\nLooking for calendar containers...')
    const calendarBlock = await page.locator('[class*="calendar"]').first()
    if (calendarBlock) {
      const outerHTML = await calendarBlock.evaluate(el => el.outerHTML).catch(() => '')
      console.log('Calendar block HTML (first 1000 chars):')
      console.log(outerHTML.substring(0, 1000))
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await browser.close()
  }
}

debugIronHorse()
