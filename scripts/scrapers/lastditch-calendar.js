async function scrapeEvents(url, timezone = 'America/New_York') {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    var events = []

    // Load the page once
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Scrape current month and next month
    for (let monthOffset = 0; monthOffset < 2; monthOffset++) {
      // If we need next month, click the forward arrow (don't reload page)
      if (monthOffset > 0) {
        // The chevron-right button is inside .vp-month-picker
        const clicked = await page.evaluate(() => {
          const chevronRight = document.querySelector('.vp-month-picker .fa-chevron-right')
          if (chevronRight) {
            // Click the parent button
            const button = chevronRight.closest('button')
            if (button) {
              button.click()
              return true
            }
          }
          return false
        })
        if (!clicked) break // Couldn't find next button, stop
        await page.waitForTimeout(2000)
      }

      const html = await page.content()
      const $ = cheerio.load(html)

      // Get the current month/year from the calendar header
      const monthYearText = $('.vp-month-picker').first().text().trim()
      const monthYearMatch = monthYearText.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)

      if (!monthYearMatch) continue

      const monthName = monthYearMatch[1]
      const year = parseInt(monthYearMatch[2])

      const monthMap = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3,
        'May': 4, 'June': 5, 'July': 6, 'August': 7,
        'September': 8, 'October': 9, 'November': 10, 'December': 11
      }
      const month = monthMap[monthName]

      // Iterate through day wrappers
      $('.vp-day-wrapper').each((dayIndex, dayEl) => {
        const $day = $(dayEl)

        // Skip past-month days
        if ($day.hasClass('past-month')) return

        const dayNumber = parseInt($day.find('.vp-day-number').text().trim())
        if (!dayNumber || isNaN(dayNumber)) return

        // Check if this is a next-month day (e.g., January days showing on December calendar)
        const isNextMonth = $day.hasClass('next-month')

        // Find events in this day
        $day.find('.vp-event-card').each((eventIndex, eventEl) => {
          const $event = $(eventEl)

          const title = $event.find('.vp-event-name').text().trim()
          if (!title) return

          const timeText = $event.find('.vp-time').text().trim()
          const eventLink = $event.find('.vp-event-link').attr('href')

          // Parse time
          const timeParts = timeText.match(/(\d+):(\d+)\s*(AM|PM)/i)
          if (!timeParts) return

          let hour = parseInt(timeParts[1])
          const minute = parseInt(timeParts[2])
          const meridiem = timeParts[3].toUpperCase()

          if (meridiem === 'PM' && hour !== 12) hour += 12
          if (meridiem === 'AM' && hour === 12) hour = 0

          // Calculate the actual month and year (handle next-month overflow)
          let eventMonth = month
          let eventYear = year
          if (isNextMonth) {
            eventMonth = month + 1
            if (eventMonth > 11) {
              eventMonth = 0
              eventYear = year + 1
            }
          }

          // Create date in local time, then convert to UTC
          const localDate = new Date(eventYear, eventMonth, dayNumber, hour, minute, 0)
          const startsAt = fromZonedTime(localDate, timezone)

          const sourceUrl = eventLink ? 'https://lastditchvenue.com' + eventLink : url

          // Skip if we already have this event (from overflow days)
          const eventKey = title + '_' + startsAt.toISOString()
          if (events.some(e => e.title + '_' + e.startsAt.toISOString() === eventKey)) return

          // Get image if available
          const imageStyle = $event.find('.vp-main-img').attr('style')
          let imageUrl = null
          if (imageStyle) {
            const match = imageStyle.match(/url\(["']?([^"')]+)["']?\)/)
            if (match) {
              imageUrl = match[1]
            }
          }

          // Parse artists from title (common patterns: "/" separated)
          const artists = []
          if (title.includes(' / ')) {
            const artistNames = title.split(' / ').map(name => name.trim())
            artistNames.forEach((name, idx) => {
              artists.push({
                name: name,
                isHeadliner: idx === 0
              })
            })
          } else {
            artists.push({
              name: title,
              isHeadliner: true
            })
          }

          const event = {
            title: title,
            startsAt: startsAt,
            sourceUrl: sourceUrl,
            ticketUrl: sourceUrl
          }

          if (imageUrl) event.imageUrl = imageUrl
          if (artists.length > 0) event.artists = artists

          events.push(event)
        })
      })
    }

    await browser.close()
    return events
  } catch (error) {
    await browser.close()
    throw error
  }
}
