import { chromium } from 'playwright'

async function debugIronHorse() {
  console.log('Debugging Iron Horse calendar page with pagination...\n')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    console.log('Navigating to calendar page...')
    await page.goto('https://ironhorse.org/calendar', { waitUntil: 'networkidle' })

    console.log('Waiting for content to load...')
    await page.waitForTimeout(5000)

    // Count initial events
    let eventCount = await page.locator('.eapp-events-calendar-masonry-item').count()
    console.log(`\n✅ Initial event count: ${eventCount}`)

    // Check for pagination button
    const nextButton = page.locator('button:has-text("Next Events")')
    const hasNextButton = await nextButton.count() > 0

    if (hasNextButton) {
      console.log('✅ Found "Next Events" button')

      // Try clicking multiple times to load all events
      let clickCount = 0
      const maxClicks = 10

      while (clickCount < maxClicks) {
        const isDisabled = await nextButton.evaluate(el => (el as HTMLButtonElement).disabled).catch(() => true)
        if (isDisabled) {
          console.log('Button is disabled, reached end of events')
          break
        }

        console.log(`\nClicking "Next Events" (attempt ${clickCount + 1})...`)
        await nextButton.click()
        await page.waitForTimeout(3000)

        const newCount = await page.locator('.eapp-events-calendar-masonry-item').count()
        console.log(`  Events now visible: ${newCount} (was ${eventCount}, added ${newCount - eventCount})`)

        if (newCount === eventCount) {
          console.log('  No new events loaded, stopping pagination')
          break
        }

        eventCount = newCount
        clickCount++
      }

      console.log(`\n🎉 Total events after pagination: ${eventCount}`)
    } else {
      console.log('❌ No "Next Events" button found')
    }

    // Sample first event
    const firstEvent = page.locator('.eapp-events-calendar-masonry-item').first()
    if (await firstEvent.count() > 0) {
      const title = await firstEvent.locator('.eapp-events-calendar-masonry-item-name').textContent()
      const date = await firstEvent.locator('.eapp-events-calendar-date-element-component').textContent()
      const time = await firstEvent.locator('.eapp-events-calendar-time-text').textContent()
      console.log(`\nFirst event:`)
      console.log(`  Title: ${title?.trim()}`)
      console.log(`  Date: ${date?.trim()}`)
      console.log(`  Time: ${time?.trim()}`)
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await browser.close()
  }
}

debugIronHorse()
