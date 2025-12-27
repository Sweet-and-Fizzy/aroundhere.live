import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig, ScrapedArtist } from '../types'
import * as cheerio from 'cheerio'

/**
 * Scraper for Haze Northampton - simple custom PHP site
 *
 * The site uses server-rendered HTML with no JavaScript loading.
 * Events are displayed on the homepage with links to individual event pages.
 */

export const hazeConfig: ScraperConfig = {
  id: 'haze',
  name: 'Haze Northampton',
  venueSlug: 'haze',
  url: 'https://hazenorthampton.org/',
  enabled: true,
  schedule: '0 6,14 * * *',
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'TWENTY_ONE_PLUS', // Bar venue
}

export class HazeScraper extends HttpScraper {
  constructor() {
    super(hazeConfig)
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const $ = cheerio.load(html)
    const events: ScrapedEvent[] = []
    const seenIds = new Set<string>()

    // Select events from the events-list (skip featured duplicate)
    $('.events-list .event-item').each((_, el) => {
      const $el = $(el)

      // Get event ID from element ID (e.g., "event-52")
      const elementId = $el.attr('id')
      const eventId = elementId?.replace('event-', '') || ''

      // Skip duplicates (featured show may duplicate an event)
      if (!eventId || seenIds.has(eventId)) return
      seenIds.add(eventId)

      // Get event link for source URL
      const eventLink = $el.find('a.event-link-wrapper').attr('href')
      const sourceUrl = eventLink
        ? eventLink.startsWith('http')
          ? eventLink
          : `https://hazenorthampton.org/${eventLink.replace(/^\//, '')}`
        : `https://hazenorthampton.org/event.php?id=${eventId}`

      // Parse date from h4 (format: "November 23, 2025")
      const dateText = $el.find('.event-info h4').text().trim()
      const startsAt = this.parseEventDate(dateText)
      if (!startsAt) return

      // Skip past events
      if (startsAt < new Date()) return

      // Parse event note (contains title + artists separated by <br />)
      const noteHtml = $el.find('.event-note').html() || ''
      const { title, description, artists } = this.parseEventNote(noteHtml)

      // Get poster image if available - look for any img inside the event item
      const imageSrc = $el.find('img[src*="uploads/posters"]').attr('src') || $el.find('img').attr('src')
      const imageUrl = imageSrc ? `https://hazenorthampton.org/${imageSrc.replace(/^\//, '')}` : undefined

      // Generate stable event ID
      const dateStr = startsAt.toISOString().split('T')[0]
      const sourceEventId = `haze-${dateStr}-${eventId}`

      events.push({
        title: title || 'Live Music at Haze',
        description,
        startsAt,
        sourceUrl,
        sourceEventId,
        imageUrl,
        artists: artists.length > 0 ? artists : undefined,
      })
    })

    return events
  }

  /**
   * Parse date string like "November 23, 2025" into a Date object
   * Default to 8 PM since the site doesn't provide times
   */
  private parseEventDate(dateText: string): Date | null {
    try {
      // Parse the date string
      const date = new Date(dateText)
      if (isNaN(date.getTime())) return null

      // Default to 8 PM since no time is provided
      date.setHours(20, 0, 0, 0)

      return date
    } catch {
      return null
    }
  }

  /**
   * Parse event note HTML which contains title and artists separated by <br />
   *
   * Example:
   * "Live Music Sunday!<br />
   * Sable Island Pony<br />
   * Alyssa Kai<br />
   * Erin Morse"
   *
   * Returns artists as well as an improved title and description.
   * If the title is generic ("Live Music Sunday!", "Live Music at Haze"),
   * we use the artist names as the title instead.
   */
  private parseEventNote(html: string): { title: string; description: string | undefined; artists: ScrapedArtist[] } {
    // Split on <br /> or <br>
    const lines = html
      .split(/<br\s*\/?>/i)
      .map((line) => line.replace(/<[^>]+>/g, '').trim())
      .filter((line) => line.length > 0)

    const rawTitle = lines[0] || ''

    // Remaining lines are artist names
    const artistNames = lines
      .slice(1)
      .filter((name) => name.length > 0 && !name.startsWith('(')) // Skip parenthetical notes

    const artists: ScrapedArtist[] = artistNames.map((name, index) => ({
      name,
      isHeadliner: index === 0,
    }))

    // Check if title is generic
    const isGenericTitle = /^live music/i.test(rawTitle)

    // If generic title but we have artist names, use artists as title
    let title: string
    let description: string | undefined

    if (isGenericTitle && artistNames.length > 0) {
      // Use artist names as the title
      title = artistNames.join(' / ')
      // Include the original title as part of description
      description = `${rawTitle} featuring ${artistNames.join(', ')}`
    } else if (artistNames.length > 0) {
      // Non-generic title, but include artist list in description
      title = rawTitle
      description = `Featuring: ${artistNames.join(', ')}`
    } else {
      title = rawTitle
      description = undefined
    }

    return { title, description, artists }
  }
}
