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

async function main() {
  console.log('Applying scraper fixes...\n')
  console.log('Database:', process.env.DATABASE_URL?.slice(0, 30) + '...\n')

  await fixButtonBallBarn()
  await fixHopeCenterYearInference()
  await fixHutghisSourceEventId()

  console.log('\nDone!')

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
