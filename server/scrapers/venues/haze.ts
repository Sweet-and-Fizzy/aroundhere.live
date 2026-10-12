import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'
import * as cheerio from 'cheerio'
import { slugify } from '../../utils/html'

/**
 * Scraper for Haze Northampton
 *
 * The events calendar is server-rendered on the homepage (www subdomain) in a
 * section with id="calendar". Since October 2026 it is a single month grid:
 * each day cell holds <time datetime="YYYY-MM-DD">, followed by event blocks
 * <div tabindex="0" aria-label="<title>"> holding a time span ("7:00 PM")
 * and a title span. Cells for adjacent months appear too, so a run can cover a few
 * days either side of the month in progress.
 *
 * IMPORTANT: the server-rendered dates and times are in UTC, not Eastern; the
 * client only converts them after hydration. "2026-10-14, 1:00 AM" in the
 * scraped HTML is really Tuesday Oct 13 9:00 PM Eastern (verified against the
 * hydrated calendar, 2026-10-12; the same was true of the August 2026 layout).
 * We therefore parse date+time as UTC to recover the true instant. If the
 * venue ever fixes their SSR to render Eastern times, the fixture test will
 * catch the shift.
 *
 * Only the current month is server-rendered (month paging is client-side),
 * so each daily run covers the month in progress.
 */

export const hazeConfig: ScraperConfig = {
  id: 'haze',
  name: 'Haze Northampton',
  venueSlug: 'haze',
  url: 'https://www.hazenorthampton.org/',
  enabled: true,
  schedule: '0 6,14 * * *',
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'TWENTY_ONE_PLUS', // Bar venue
}

const TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Parse the server-rendered calendar section of the Haze homepage.
 * Exported for testing.
 */
export function parseHazeCalendar(html: string): ScrapedEvent[] {
  const $ = cheerio.load(html)
  const calendar = $('#calendar')
  if (calendar.length === 0) return []

  const events: ScrapedEvent[] = []
  const seen = new Set<string>()

  calendar.find('time[datetime]').each((_, timeEl) => {
    // UTC date of the cell (see module comment)
    const dateStr = ($(timeEl).attr('datetime') || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return

    $(timeEl).parent().find('[tabindex][aria-label]').each((_, evEl) => {
      const $ev = $(evEl)
      // The visible title span; the aria-label sometimes adds a UI prefix such as "Get tickets: "
      const spans = $ev.find('span').map((_, s) => $(s).text().trim()).get()
      const title = spans.find(t => t && !TIME.test(t)) || ($ev.attr('aria-label') || '').trim()
      if (!title) return

      // Time span, e.g. "7:00 PM"; default to 23:00 UTC (~7 PM Eastern) when absent
      const timeText = $ev
        .find('span')
        .filter((_, s) => TIME.test($(s).text().trim()))
        .first()
        .text()
        .trim()
      let hour = 23
      let minute = 0
      const timeMatch = timeText.match(TIME)
      if (timeMatch) {
        hour = parseInt(timeMatch[1]!, 10)
        minute = parseInt(timeMatch[2]!, 10)
        const ampm = timeMatch[3]!.toUpperCase()
        if (ampm === 'PM' && hour !== 12) hour += 12
        if (ampm === 'AM' && hour === 12) hour = 0
      }

      const sourceEventId = `haze-${dateStr}-${slugify(title)}`
      if (seen.has(sourceEventId)) return
      seen.add(sourceEventId)

      // Note: calendar flyer images are pre-signed S3 URLs that expire within
      // an hour, so we deliberately do not store imageUrl.
      events.push({
        title,
        startsAt: new Date(`${dateStr}T${pad(hour)}:${pad(minute)}:00Z`),
        sourceUrl: 'https://www.hazenorthampton.org/#calendar',
        sourceEventId,
      })
    })
  })

  return events
}

export class HazeScraper extends HttpScraper {
  constructor() {
    super(hazeConfig)
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const now = new Date()
    return parseHazeCalendar(html).filter(e => e.startsAt >= now)
  }
}
