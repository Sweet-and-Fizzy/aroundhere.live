import { PlaywrightScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'

export interface EventbriteScraperConfig extends ScraperConfig {
  organizerId: string
}

interface EventbriteListItem {
  id: string
  url: string
  title?: string
  summary?: string
}

interface EventLdJson {
  '@type'?: string | string[]
  name?: string
  description?: string
  startDate?: string
  endDate?: string
  image?: string | { url?: string }
  offers?: unknown
}

/**
 * Find the schema.org Event object in a page's LD+JSON blocks
 * (handles arrays and @graph nesting). Exported for testing.
 */
export function findEventLd(blocks: unknown[]): EventLdJson | null {
  const flat: unknown[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    flat.push(node)
    const graph = (node as { '@graph'?: unknown })['@graph']
    if (graph) visit(graph)
  }
  blocks.forEach(visit)

  return (
    (flat.find((item) => {
      const type = (item as EventLdJson)['@type']
      const types = Array.isArray(type) ? type : [type]
      return types.some(t => typeof t === 'string' && t.includes('Event'))
    }) as EventLdJson | undefined) || null
  )
}

/**
 * Format an LD+JSON offers value into a display price. Exported for testing.
 */
export function formatOffersPrice(offers: unknown): string | undefined {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : []
  const prices: number[] = []
  for (const offer of list) {
    if (!offer || typeof offer !== 'object') continue
    const o = offer as { price?: unknown; lowPrice?: unknown; highPrice?: unknown }
    for (const raw of [o.price, o.lowPrice, o.highPrice]) {
      const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN
      if (!isNaN(n)) prices.push(n)
    }
  }
  if (prices.length === 0) return undefined
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  if (max === 0) return 'Free'
  if (min === max) return `$${min}`
  return `$${min}-$${max}`
}

/**
 * Detect an age restriction mention in page text. Exported for testing.
 */
export function parseAgeRestrictionFromText(
  text: string
): 'ALL_AGES' | 'EIGHTEEN_PLUS' | 'TWENTY_ONE_PLUS' | undefined {
  if (/\b21\+|\btwenty[- ]?one\s*\+|21\s*and\s*over|ages?\s*21/i.test(text)) {
    return 'TWENTY_ONE_PLUS'
  }
  if (/\b18\+|\beighteen\s*\+|18\s*and\s*over|ages?\s*18/i.test(text)) {
    return 'EIGHTEEN_PLUS'
  }
  if (/\ball\s*ages/i.test(text)) {
    return 'ALL_AGES'
  }
  return undefined
}

/**
 * Read the organizer page's embedded upcomingEvents list (Next.js __NEXT_DATA__).
 * Returns null when the page has no such list (e.g. a bot-challenge page) or
 * when the list is shorter than upcomingEventsTotal: saving a partial list
 * would cancel every event missing from it. Exported for testing.
 */
export function extractEmbeddedUpcomingEvents(html: string): EventbriteListItem[] | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match?.[1]) return null

  let data: unknown
  try {
    data = JSON.parse(match[1])
  } catch {
    return null
  }

  const findUpcoming = (
    node: unknown
  ): { upcomingEvents: unknown[]; upcomingEventsTotal?: unknown } | null => {
    if (!node || typeof node !== 'object') return null
    const holder = node as { upcomingEvents?: unknown; upcomingEventsTotal?: unknown }
    if (Array.isArray(holder.upcomingEvents)) {
      return { upcomingEvents: holder.upcomingEvents, upcomingEventsTotal: holder.upcomingEventsTotal }
    }
    for (const child of Object.values(node)) {
      const found = findUpcoming(child)
      if (found) return found
    }
    return null
  }

  const found = findUpcoming(data)
  if (!found) return null
  const upcoming = found.upcomingEvents
  if (typeof found.upcomingEventsTotal === 'number' && found.upcomingEventsTotal > upcoming.length) {
    return null
  }

  const items: EventbriteListItem[] = []
  for (const event of upcoming) {
    const e = event as { id?: unknown; url?: unknown; name?: unknown; summary?: unknown }
    if ((typeof e.id !== 'string' && typeof e.id !== 'number') || typeof e.url !== 'string') continue
    items.push({
      id: String(e.id),
      url: e.url,
      title: typeof e.name === 'string' ? e.name : undefined,
      summary: typeof e.summary === 'string' ? e.summary : undefined,
    })
  }
  return items
}

/**
 * Base scraper for Eventbrite organizers.
 *
 * Eventbrite's organizer pages no longer embed usable event data
 * (the old window.__SERVER_DATA__ path died in their 2026 React rewrite,
 * and the /org/<id>/showmore JSON endpoint now strips dates). So we:
 *   1. list future events via the /org/<id>/showmore JSON endpoint
 *      (ids + urls are still populated), then
 *   2. visit each event page with Playwright and read its schema.org
 *      Event LD+JSON for dates, image, and price, plus the page text
 *      for age-restriction mentions.
 */
export abstract class EventbriteScraper extends PlaywrightScraper {
  protected organizerId: string

  constructor(config: EventbriteScraperConfig) {
    super({
      ...config,
      url: `https://www.eventbrite.com/o/${config.organizerId}`,
    })
    this.organizerId = config.organizerId
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    let listing: EventbriteListItem[]
    try {
      listing = await this.fetchFutureEventList()
    } catch (error) {
      // showmore gets blocked (CloudFront 403); the organizer page we already
      // loaded embeds the same upcoming list
      const embedded = extractEmbeddedUpcomingEvents(html)
      if (!embedded) throw error
      console.log(`[${this.config.name}] ${(error as Error).message}; using organizer page list`)
      listing = embedded
    }
    console.log(`[${this.config.name}] Organizer has ${listing.length} future events`)

    const scrapedEvents: ScrapedEvent[] = []
    for (const item of listing) {
      try {
        const scrapedEvent = await this.parseEventDetail(item)
        if (scrapedEvent) scrapedEvents.push(scrapedEvent)
      } catch (error) {
        console.error(`[${this.config.name}] Error parsing event ${item.url}:`, error)
      }
    }

    return scrapedEvents
  }

  /**
   * List the organizer's future events from the showmore JSON endpoint.
   */
  protected async fetchFutureEventList(): Promise<EventbriteListItem[]> {
    const results: EventbriteListItem[] = []
    for (let pageNum = 1; pageNum <= 10; pageNum++) {
      const response = await fetch(
        `https://www.eventbrite.com/org/${this.organizerId}/showmore/?type=future&page=${pageNum}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          },
        }
      )
      // A failed first page means we can't list events at all; a failed later
      // page just ends pagination with what we have
      if (!response.ok) {
        if (pageNum === 1) throw new Error(`Eventbrite showmore returned HTTP ${response.status}`)
        break
      }
      let json: { data?: { events?: Array<Record<string, unknown>>; has_next_page?: boolean } }
      try {
        json = await response.json()
      } catch {
        if (pageNum === 1) throw new Error('Eventbrite showmore returned non-JSON')
        break
      }
      for (const event of json.data?.events || []) {
        const id = event.id as string | undefined
        const url = event.url as string | undefined
        if (!id || !url) continue
        results.push({
          id,
          url,
          title: (event.name as { text?: string } | undefined)?.text,
          summary: event.summary as string | undefined,
        })
      }
      if (!json.data?.has_next_page) break
    }
    return results
  }

  /**
   * Visit one event page and build a ScrapedEvent from its LD+JSON.
   */
  protected async parseEventDetail(item: EventbriteListItem): Promise<ScrapedEvent | null> {
    if (!this.page) return null

    await this.page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    try {
      await this.page.waitForSelector('script[type="application/ld+json"]', { timeout: 10000 })
    } catch {
      // fall through — evaluate below handles missing blocks
    }

    const pageData = await this.page.evaluate(() => {
      const blocks: unknown[] = []
      document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
        try {
          blocks.push(JSON.parse(script.textContent || ''))
        } catch {
          // skip malformed blocks
        }
      })
      return { blocks, bodyText: document.body.innerText }
    })

    const eventLd = findEventLd(pageData.blocks)
    if (!eventLd?.startDate) {
      console.log(`[${this.config.name}] No Event LD+JSON on ${item.url}`)
      return null
    }

    const startsAt = new Date(eventLd.startDate)
    if (isNaN(startsAt.getTime()) || startsAt < new Date()) return null

    const endsAt = eventLd.endDate ? new Date(eventLd.endDate) : undefined
    const imageUrl =
      typeof eventLd.image === 'string' ? eventLd.image : eventLd.image?.url

    return {
      title: item.title || eventLd.name || 'Untitled event',
      description: item.summary || eventLd.description,
      startsAt,
      endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
      sourceUrl: item.url,
      sourceEventId: `eventbrite-${item.id}`,
      coverCharge: formatOffersPrice(eventLd.offers),
      imageUrl,
      ticketUrl: item.url,
      ageRestriction: parseAgeRestrictionFromText(pageData.bodyText),
    }
  }

  // Organizer page HTML itself is unused; keep navigation light.
  protected override getWaitUntilStrategy(): 'networkidle' | 'domcontentloaded' | 'load' | 'commit' {
    return 'domcontentloaded'
  }
}
