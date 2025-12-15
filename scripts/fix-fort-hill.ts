import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const fixedCode = `async function scrapeEvents(url, timezone = 'America/New_York') {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Handle age verification popup
    try {
      await page.evaluate(function() {
        var verifyBtn = document.querySelector('#verify')
        if (verifyBtn) verifyBtn.click()

        var overlay = document.querySelector('.ui-widget-overlay')
        if (overlay) overlay.remove()

        var dialog = document.querySelector('#verification-dialog')
        if (dialog && dialog.parentElement) dialog.parentElement.remove()
      })
      await page.waitForTimeout(1000)
    } catch (e) { /* ignore */ }

    var allEvents = []
    var monthsToScrape = 6
    var currentYear = new Date().getFullYear()

    // Helper to normalize titles for dedup comparison
    function normalizeTitle(title) {
      return title
        .toLowerCase()
        .replace(/^live music:\\s*/i, '')
        .replace(/^food truck:\\s*/i, '')
        .replace(/^event:\\s*/i, '')
        .replace(/[^a-z0-9]/g, '')
    }

    // Helper to check if event already exists
    function eventExists(newEvent) {
      var normalizedNewTitle = normalizeTitle(newEvent.title)
      return allEvents.some(function(existing) {
        var normalizedExisting = normalizeTitle(existing.title)
        var timeDiff = Math.abs(existing.startsAt.getTime() - newEvent.startsAt.getTime())
        return normalizedNewTitle === normalizedExisting && timeDiff < 3600000 // 1 hour
      })
    }

    for (var i = 0; i < monthsToScrape; i++) {
      var html = await page.content()
      var $ = cheerio.load(html)

      // Extract events from calendar view (skip JSON-LD to avoid duplicates)
      $('.yui3-calendar-day.has-event').each(function(_, dayEl) {
        var $day = $(dayEl)
        var dayNum = $day.find('.marker-daynum').text().trim()

        var monthHeader = $('.yui3-calendar-header-label').text().trim()
        var monthMatch = monthHeader.match(/(\\w+)\\s+(\\d{4})/)
        var month = monthMatch ? monthMatch[1] : ''
        var year = monthMatch ? parseInt(monthMatch[2]) : currentYear

        $day.find('.item').each(function(_, itemEl) {
          var $item = $(itemEl)
          var $link = $item.find('.item-link')

          var rawTitle = $link.find('.item-title').text().trim()
          var timeStr = $link.find('.item-time--12hr').text().trim().replace(/\\s+/g, ' ')
          var eventUrl = $link.attr('href')

          // Clean the title - remove prefixes
          var title = rawTitle
            .replace(/^live music:\\s*/i, '')
            .replace(/^food truck:\\s*/i, '')
            .replace(/^event:\\s*/i, '')
            .trim()

          // Skip closed days and food trucks
          if (!title || title.toLowerCase().includes('closed') || rawTitle.toLowerCase().startsWith('food truck')) {
            return
          }

          if (dayNum && month) {
            var timeMatch = timeStr.match(/(\\d{1,2}):(\\d{2})\\s*(AM|PM)/i)

            if (timeMatch) {
              var hours = parseInt(timeMatch[1])
              var minutes = parseInt(timeMatch[2])
              var ampm = timeMatch[3].toUpperCase()

              if (ampm === 'PM' && hours !== 12) hours += 12
              if (ampm === 'AM' && hours === 12) hours = 0

              var localDate = new Date(year, getMonthNumber(month), parseInt(dayNum), hours, minutes)
              var startsAt = fromZonedTime(localDate, timezone)

              var event = {
                title: title,
                startsAt: startsAt,
                sourceUrl: eventUrl ? (eventUrl.startsWith('http') ? eventUrl : 'https://www.forthillbrewery.com' + eventUrl) : url,
                artists: [{ name: title, isHeadliner: true }],
                genres: ['Live Music']
              }

              // Get end time from flyout
              var flyoutItem = $day.find('.flyoutitem').filter(function() {
                return $(this).find('.flyoutitem-title a').attr('href') === eventUrl
              }).first()

              if (flyoutItem.length) {
                var timeRange = flyoutItem.find('.flyoutitem-datetime--12hr').text().trim()
                var endTimeMatch = timeRange.match(/–\\s*(\\d{1,2}:\\d{2}\\s*[AP]M)/i)
                if (endTimeMatch) {
                  var endTimeStr = endTimeMatch[1].trim()
                  var endTimeMatchParts = endTimeStr.match(/(\\d{1,2}):(\\d{2})\\s*(AM|PM)/i)
                  if (endTimeMatchParts) {
                    var endHours = parseInt(endTimeMatchParts[1])
                    var endMinutes = parseInt(endTimeMatchParts[2])
                    var endAmpm = endTimeMatchParts[3].toUpperCase()

                    if (endAmpm === 'PM' && endHours !== 12) endHours += 12
                    if (endAmpm === 'AM' && endHours === 12) endHours = 0

                    var localEndDate = new Date(year, getMonthNumber(month), parseInt(dayNum), endHours, endMinutes)
                    event.endsAt = fromZonedTime(localEndDate, timezone)
                  }
                }
              }

              // Check if this event already exists
              if (!eventExists(event)) {
                allEvents.push(event)
              }
            }
          }
        })
      })

      // Navigate to next month
      if (i < monthsToScrape - 1) {
        try {
          var nextBtn = await page.$('.yui3-calendarnav-nextmonth')
          if (nextBtn) {
            await nextBtn.click()
            await page.waitForTimeout(2000)
          } else {
            break
          }
        } catch (e) {
          break
        }
      }
    }

    // Visit detail pages for additional information (images, descriptions)
    for (var j = 0; j < allEvents.length && j < 20; j++) {
      var event = allEvents[j]
      if (event.sourceUrl && event.sourceUrl !== url && event.sourceUrl.includes('forthillbrewery.com')) {
        try {
          await page.goto(event.sourceUrl, { waitUntil: 'domcontentloaded' })
          await page.waitForTimeout(1000)

          var detailHtml = await page.content()
          var $detail = cheerio.load(detailHtml)

          // Check for structured data on detail page
          $detail('script[type="application/ld+json"]').each(function(_, script) {
            try {
              var jsonData = JSON.parse($detail(script).html())
              if (jsonData['@type'] === 'Event') {
                if (jsonData.image && jsonData.image.length > 0) {
                  event.imageUrl = jsonData.image[0]
                }
                if (jsonData.description) {
                  event.description = jsonData.description
                }
              }
            } catch (e) { /* ignore */ }
          })

          // Extract description from event content
          var description = $detail('.eventitem-column-content').html()
          if (description && description.trim()) {
            event.description = description.trim()
          }

        } catch (e) {
          // Continue if detail page fails
        }
      }
    }

    await browser.close()
    return allEvents
  } catch (error) {
    await browser.close()
    throw error
  }
}

function getMonthNumber(monthName) {
  var months = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  }
  return months[monthName.toLowerCase()] || 0
}`

async function main() {
  const source = await prisma.source.findFirst({
    where: { slug: 'fort-hill-brewery' }
  })

  if (!source) {
    console.error('Fort Hill source not found')
    process.exit(1)
  }

  const config = source.config as Record<string, unknown>
  config.generatedCode = fixedCode

  await prisma.source.update({
    where: { id: source.id },
    data: { config }
  })

  console.log('Updated Fort Hill scraper code')

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
