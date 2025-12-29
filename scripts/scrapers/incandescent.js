async function scrapeEvents(url, timezone = 'America/New_York') {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const html = await page.content()
    const $ = cheerio.load(html)

    var events = []

    $('.eventlist-event--upcoming').each((index, element) => {
      const $event = $(element)

      const title = $event.find('.eventlist-title-link').text().trim()
      if (!title) return

      const eventUrl = $event.find('.eventlist-title-link').attr('href')
      const sourceUrl = eventUrl ? `https://www.incandescentbrewing.com${eventUrl}` : url

      // Get the date from the first .event-date element
      const dateStr = $event.find('.event-date').first().attr('datetime')
      if (!dateStr) return

      // Try to get start time from multiple possible sources
      let startTimeText = null

      // First try .event-time-localized-start (for events with explicit start/end)
      const $startTime = $event.find('.event-time-localized-start')
      if ($startTime.length > 0) {
        startTimeText = $startTime.text().trim()
      } else {
        // Fall back to .event-time-localized (for single-time events or multi-day events)
        const $timeLocalized = $event.find('.event-time-localized').first()
        if ($timeLocalized.length > 0) {
          // If it's a time element, get its text
          if ($timeLocalized.is('time')) {
            startTimeText = $timeLocalized.text().trim()
          } else {
            // It might be a span containing time elements
            const $innerTime = $timeLocalized.find('time').first()
            if ($innerTime.length > 0) {
              startTimeText = $innerTime.text().trim()
            } else {
              startTimeText = $timeLocalized.text().trim()
            }
          }
        }
      }

      let startsAt = null

      if (startTimeText) {
        // Parse time like "4:00 PM" or "2:00 PM"
        const timeMatch = startTimeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
        if (timeMatch) {
          let hours = parseInt(timeMatch[1])
          const minutes = parseInt(timeMatch[2])
          const ampm = timeMatch[3].toUpperCase()

          if (ampm === 'PM' && hours !== 12) hours += 12
          if (ampm === 'AM' && hours === 12) hours = 0

          const localDateTime = `${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`
          startsAt = fromZonedTime(new Date(localDateTime), timezone)
        }
      }

      // If we still don't have a start time, use midnight on the date
      if (!startsAt) {
        startsAt = fromZonedTime(new Date(`${dateStr}T00:00:00`), timezone)
      }

      // Get end time
      let endsAt = null
      const $endTime = $event.find('.event-time-localized-end')
      if ($endTime.length > 0) {
        const endTimeText = $endTime.text().trim()
        const timeMatch = endTimeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
        if (timeMatch) {
          let hours = parseInt(timeMatch[1])
          const minutes = parseInt(timeMatch[2])
          const ampm = timeMatch[3].toUpperCase()

          if (ampm === 'PM' && hours !== 12) hours += 12
          if (ampm === 'AM' && hours === 12) hours = 0

          const localDateTime = `${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`
          endsAt = fromZonedTime(new Date(localDateTime), timezone)
        }
      }

      const imageUrl = $event.find('.eventlist-column-thumbnail img').attr('data-src') ||
                      $event.find('.eventlist-column-thumbnail img').attr('src')

      let description = ''
      const excerptText = $event.find('.eventlist-excerpt').text().trim()
      const descriptionHtml = $event.find('.eventlist-description').html()

      if (descriptionHtml) {
        description = descriptionHtml
      } else if (excerptText) {
        description = excerptText
      }

      const event = {
        title: title,
        startsAt: startsAt,
        sourceUrl: sourceUrl
      }

      if (description) event.description = description
      if (imageUrl) event.imageUrl = imageUrl
      if (endsAt) event.endsAt = endsAt

      events.push(event)
    })

    await browser.close()
    return events
  } catch (error) {
    await browser.close()
    throw error
  }
}
