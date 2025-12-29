/**
 * Apply scraper fixes to database
 *
 * Run against production with:
 *   DATABASE_URL="<prod-url>" npx tsx scripts/apply-scraper-fixes.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ButtonBall Barn - ShowSlinger-specific scraper
const buttonballCode = `async function scrapeEvents(url, timezone = 'America/New_York') {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    var events = []

    // Check for Showslinger widget iframe
    const iframeSelector = 'iframe[src*="showslinger"]'
    const iframe = await page.$(iframeSelector)

    if (iframe) {
      const iframeSrc = await iframe.getAttribute('src')
      if (iframeSrc) {
        // Navigate to the iframe content
        await page.goto(iframeSrc, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(5000)

        // Wait for ShowSlinger events to load
        await page.waitForSelector('.mrk_filter_event_by_venue', { timeout: 20000 }).catch(() => {})

        const html = await page.content()
        const $ = cheerio.load(html)

        // Track seen events to avoid duplicates (list view and calendar view show same events)
        const seenEvents = new Set()

        // Parse ShowSlinger event cards
        $('.mrk_filter_event_by_venue').each((i, el) => {
          const $card = $(el)

          // Skip if this is a calendar thumbnail (no time/price displayed)
          const timeText = $card.find('.widget-time').text().trim()
          if (!timeText) return

          // Extract event name
          const title = $card.find('.widget-name, h4.widget-name').text().trim()
          if (!title) return

          // Extract date from widget-date-month (e.g., "Dec 26")
          const dateText = $card.find('.widget-date-month').text().trim()
          if (!dateText) return

          // Create dedup key
          const dedupKey = title + '|' + dateText
          if (seenEvents.has(dedupKey)) return
          seenEvents.add(dedupKey)

          // Parse date - format is like "Dec 26" or "Jan  2"
          const currentYear = new Date().getFullYear()
          const dateMatch = dateText.match(/(\\w+)\\s*(\\d{1,2})/)
          if (!dateMatch) return

          const monthStr = dateMatch[1]
          const day = parseInt(dateMatch[2])

          // Parse the date
          var dateStr = monthStr + ' ' + day + ', ' + currentYear
          var testDate = new Date(dateStr)

          // If the date is in the past, use next year
          if (!isNaN(testDate.getTime()) && testDate < new Date()) {
            dateStr = monthStr + ' ' + day + ', ' + (currentYear + 1)
          }

          var startsAt = new Date(dateStr)
          if (isNaN(startsAt.getTime())) return

          // Parse time from widget-time (e.g., "7:30 PM")
          const timeMatch = timeText.match(/(\\d{1,2}):(\\d{2})\\s*(AM|PM)/i)
          if (timeMatch) {
            var hours = parseInt(timeMatch[1])
            const minutes = parseInt(timeMatch[2])
            const isPM = timeMatch[3].toUpperCase() === 'PM'

            if (isPM && hours !== 12) hours += 12
            if (!isPM && hours === 12) hours = 0

            startsAt.setHours(hours, minutes, 0, 0)
          }

          // Convert to UTC
          startsAt = fromZonedTime(startsAt, timezone)

          // Extract price from widget-price
          const priceText = $card.find('.widget-price').text().trim()
          var coverCharge = null
          if (priceText) {
            const priceMatch = priceText.match(/\\$(\\d+)/)
            if (priceMatch) {
              coverCharge = '$' + priceMatch[1]
            } else if (priceText.toLowerCase().includes('free')) {
              coverCharge = 'Free'
            }
          }

          // Extract image URL
          var imageUrl = null
          const imgEl = $card.find('img.grid-img')
          if (imgEl.length) {
            imageUrl = imgEl.attr('src')
          }
          if (!imageUrl) {
            const coverDiv = $card.find('.cover-image')
            if (coverDiv.length) {
              const style = coverDiv.attr('style') || ''
              const bgMatch = style.match(/url\\(['"]?([^'"\\)]+)['"]?\\)/)
              if (bgMatch) {
                imageUrl = bgMatch[1]
              }
            }
          }

          // Extract ticket URL
          var ticketUrl = null
          const ticketBtn = $card.find('a.button-widget, a.mrk_ticket_event_url, a[href*="/v/"]')
          if (ticketBtn.length) {
            const href = ticketBtn.attr('href')
            if (href) {
              // Convert relative URL to absolute
              try {
                ticketUrl = new URL(href, 'https://app.showslinger.com').href
              } catch (e) {
                ticketUrl = href.startsWith('http') ? href : 'https://app.showslinger.com' + href
              }
            }
          }

          // Generate sourceEventId from ticket URL slug or title+date
          var sourceEventId = null
          if (ticketUrl) {
            const slugMatch = ticketUrl.match(/\\/v\\/([^?]+)/)
            if (slugMatch) {
              sourceEventId = 'showslinger-' + slugMatch[1]
            }
          }
          if (!sourceEventId) {
            const dateKey = startsAt.toISOString().split('T')[0]
            const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)
            sourceEventId = 'buttonball-' + dateKey + '-' + titleSlug
          }

          events.push({
            title: title,
            startsAt: startsAt,
            sourceUrl: url,
            imageUrl: imageUrl || undefined,
            ticketUrl: ticketUrl || undefined,
            coverCharge: coverCharge || undefined,
            sourceEventId: sourceEventId
          })
        })
      }
    }

    await browser.close()
    return events
  } catch (error) {
    await browser.close()
    throw error
  }
}`

async function fixButtonBallBarn() {
  const source = await prisma.source.findFirst({
    where: { name: { contains: 'buttonball', mode: 'insensitive' } }
  })

  if (!source) {
    console.log('⚠️  ButtonBall Barn source not found')
    return false
  }

  const config = source.config as Record<string, unknown>

  await prisma.source.update({
    where: { id: source.id },
    data: {
      config: {
        ...config,
        generatedCode: buttonballCode
      }
    }
  })

  console.log('✓  ButtonBall Barn: Updated with ShowSlinger-specific scraper')
  return true
}

async function fixHopeCenterYearInference() {
  const source = await prisma.source.findFirst({
    where: { name: { contains: 'hope center', mode: 'insensitive' } }
  })

  if (!source) {
    console.log('⚠️  Hope Center for the Arts source not found')
    return false
  }

  const config = source.config as Record<string, unknown>
  let code = config.generatedCode as string

  if (!code) {
    console.log('⚠️  Hope Center: No generated code found')
    return false
  }

  // Check if already fixed
  if (code.includes('testDate < new Date()')) {
    console.log('✓  Hope Center: Already has date-in-past check')
    return true
  }

  // Old pattern: checking specific months (Jan/Feb/Mar)
  const oldLogicPattern = /var dateWithYear = cleanDateStr \+ ', ' \+ currentYear\s+if \(cleanDateStr\.includes\('Jan '\)[^}]+\}/

  if (oldLogicPattern.test(code)) {
    const newLogic = `// Try current year first, if in past use next year
        var dateWithYear = cleanDateStr + ', ' + currentYear
        var testDate = new Date(dateWithYear)
        if (!isNaN(testDate.getTime()) && testDate < new Date()) {
          dateWithYear = cleanDateStr + ', ' + (currentYear + 1)
        }`

    code = code.replace(oldLogicPattern, newLogic)

    await prisma.source.update({
      where: { id: source.id },
      data: {
        config: {
          ...config,
          generatedCode: code
        }
      }
    })

    console.log('✓  Hope Center: Updated with smarter year inference')
    return true
  } else {
    console.log('⚠️  Hope Center: Pattern not found (may have different code structure)')
    return false
  }
}

async function fixHutghisSourceEventId() {
  const source = await prisma.source.findFirst({
    where: { name: { contains: 'nook', mode: 'insensitive' } }
  })

  if (!source) {
    console.log('⚠️  Hutghi\'s at the Nook source not found')
    return false
  }

  const config = source.config as Record<string, unknown>
  let code = config.generatedCode as string

  if (!code) {
    console.log('⚠️  Hutghi\'s: No generated code found')
    return false
  }

  // Check if already fixed
  if (code.includes('sourceEventId')) {
    console.log('✓  Hutghi\'s: Already has sourceEventId generation')
    return true
  }

  // Old pattern: event object without sourceEventId
  const oldPush = `var event = {
        title: title,
        startsAt: startsAt,
        sourceUrl: eventUrl.startsWith('http') ? eventUrl : 'https://m3pn87-t7.myshopify.com' + eventUrl
      }`

  const newPush = `// Generate stable sourceEventId from date + title
      var dateStr = startsAt.toISOString().split('T')[0]
      var titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)
      var sourceEventId = 'hutghis-' + dateStr + '-' + titleSlug

      var event = {
        title: title,
        startsAt: startsAt,
        sourceUrl: eventUrl.startsWith('http') ? eventUrl : 'https://m3pn87-t7.myshopify.com' + eventUrl,
        sourceEventId: sourceEventId
      }`

  if (code.includes(oldPush)) {
    code = code.replace(oldPush, newPush)

    await prisma.source.update({
      where: { id: source.id },
      data: {
        config: {
          ...config,
          generatedCode: code
        }
      }
    })

    console.log('✓  Hutghi\'s: Added sourceEventId generation')
    return true
  } else {
    console.log('⚠️  Hutghi\'s: Pattern not found (may have different code structure)')
    return false
  }
}

// Incandescent Brewing - extract times from Google Calendar links
const incandescentCode = `async function scrapeEvents(url, timezone = 'America/New_York') {
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
      const sourceUrl = eventUrl ? \`https://www.incandescentbrewing.com\${eventUrl}\` : url

      // Try to get datetime from Google Calendar link first (most reliable)
      const googleCalUrl = $event.find('a[href*="google.com/calendar"]').attr('href')
      let startsAt, endsAt

      if (googleCalUrl) {
        const datesMatch = googleCalUrl.match(/dates=(\\d{8}T\\d{6}Z)\\/(\\d{8}T\\d{6}Z)/)
        if (datesMatch) {
          // Parse UTC timestamps from Google Calendar URL
          const startUtc = datesMatch[1]
          const endUtc = datesMatch[2]

          // Parse format: 20251231T210000Z
          const parseGoogleDate = (dateStr) => {
            const year = dateStr.substring(0, 4)
            const month = dateStr.substring(4, 6)
            const day = dateStr.substring(6, 8)
            const hour = dateStr.substring(9, 11)
            const minute = dateStr.substring(11, 13)
            const second = dateStr.substring(13, 15)
            return new Date(\`\${year}-\${month}-\${day}T\${hour}:\${minute}:\${second}Z\`)
          }

          startsAt = parseGoogleDate(startUtc)
          endsAt = parseGoogleDate(endUtc)
        }
      }

      // Fallback to datetime attributes if Google Calendar parsing failed
      if (!startsAt) {
        const dateTimeStr = $event.find('.event-date').attr('datetime')
        const startTimeStr = $event.find('.event-time-localized-start').attr('datetime')
        const endTimeStr = $event.find('.event-time-localized-end').attr('datetime')

        if (dateTimeStr) {
          if (startTimeStr && startTimeStr !== dateTimeStr) {
            startsAt = fromZonedTime(new Date(startTimeStr), timezone)
          } else {
            const startTimeText = $event.find('.event-time-localized-start').text().trim()
            if (startTimeText) {
              const dateOnly = dateTimeStr.split('T')[0]
              const timeMatch = startTimeText.match(/(\\d{1,2}):(\\d{2})\\s*(AM|PM)/i)
              if (timeMatch) {
                let hours = parseInt(timeMatch[1])
                const minutes = parseInt(timeMatch[2])
                const ampm = timeMatch[3].toUpperCase()

                if (ampm === 'PM' && hours !== 12) hours += 12
                if (ampm === 'AM' && hours === 12) hours = 0

                const localDateTime = \`\${dateOnly}T\${String(hours).padStart(2, '0')}:\${String(minutes).padStart(2, '0')}:00\`
                startsAt = fromZonedTime(new Date(localDateTime), timezone)
              }
            }
          }

          if (endTimeStr && endTimeStr !== dateTimeStr) {
            endsAt = fromZonedTime(new Date(endTimeStr), timezone)
          } else {
            const endTimeText = $event.find('.event-time-localized-end').text().trim()
            if (endTimeText) {
              const dateOnly = dateTimeStr.split('T')[0]
              const timeMatch = endTimeText.match(/(\\d{1,2}):(\\d{2})\\s*(AM|PM)/i)
              if (timeMatch) {
                let hours = parseInt(timeMatch[1])
                const minutes = parseInt(timeMatch[2])
                const ampm = timeMatch[3].toUpperCase()

                if (ampm === 'PM' && hours !== 12) hours += 12
                if (ampm === 'AM' && hours === 12) hours = 0

                const localDateTime = \`\${dateOnly}T\${String(hours).padStart(2, '0')}:\${String(minutes).padStart(2, '0')}:00\`
                endsAt = fromZonedTime(new Date(localDateTime), timezone)
              }
            }
          }

          // Last resort: use date only
          if (!startsAt) {
            startsAt = fromZonedTime(new Date(dateTimeStr), timezone)
          }
        }
      }

      if (!startsAt) return // Skip if we couldn't determine any date

      const imageUrl = $event.find('.eventlist-column-thumbnail img').attr('data-src') ||
                      $event.find('.eventlist-column-thumbnail img').attr('src')

      // Extract description - both plain text and HTML
      let description = ''
      let descriptionHtml = ''
      const excerptText = $event.find('.eventlist-excerpt').text().trim()
      const descriptionEl = $event.find('.eventlist-description')

      if (descriptionEl.length) {
        // Get the raw HTML for rich content display
        descriptionHtml = descriptionEl.html()

        // Extract clean plain text with paragraph breaks
        const paragraphs = descriptionEl.find('p')
        if (paragraphs.length) {
          description = paragraphs.map((i, p) => $(p).text().trim()).get().join('\\n\\n')
        } else {
          description = descriptionEl.text().trim()
        }
      } else if (excerptText) {
        description = excerptText
      }

      const event = {
        title: title,
        startsAt: startsAt,
        sourceUrl: sourceUrl
      }

      if (description) event.description = description
      if (descriptionHtml) event.descriptionHtml = descriptionHtml
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
}`

async function fixIncandescentBrewing() {
  const source = await prisma.source.findFirst({
    where: { name: { contains: 'incandescent', mode: 'insensitive' } }
  })

  if (!source) {
    console.log('⚠️  Incandescent Brewing source not found')
    return false
  }

  const config = source.config as Record<string, unknown>

  // Check if already has all fixes: Google Calendar parsing, clean descriptions, AND descriptionHtml
  const currentCode = config.generatedCode as string
  if (currentCode?.includes('google.com/calendar') && currentCode?.includes('paragraphs.map') && currentCode?.includes('event.descriptionHtml')) {
    console.log('✓  Incandescent Brewing: Already has all fixes (time extraction, clean descriptions, HTML)')
    return true
  }

  await prisma.source.update({
    where: { id: source.id },
    data: {
      config: {
        ...config,
        generatedCode: incandescentCode
      }
    }
  })

  console.log('✓  Incandescent Brewing: Updated to extract times from Google Calendar links')
  return true
}

async function main() {
  console.log('Applying scraper fixes...\n')
  console.log('Database:', process.env.DATABASE_URL?.slice(0, 30) + '...\n')

  await fixButtonBallBarn()
  await fixHopeCenterYearInference()
  await fixHutghisSourceEventId()
  await fixIncandescentBrewing()

  console.log('\nDone!')

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
