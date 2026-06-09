import { fromZonedTime } from 'date-fns-tz'
import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig, ScraperResult } from '../types'

export const theHeavyCultureCoopConfig: ScraperConfig = {
  id: 'the-heavy-culture-coop',
  name: 'The Heavy Culture Cooperative',
  venueSlug: 'the-heavy-culture-coop',
  url: 'https://www.theheavyculture.coop/shows',
  enabled: true,
  schedule: '0 6,14 * * *', // 6 AM and 2 PM daily
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  // THCC runs a full bar, so events with no stated age default to 21+. The scraper still
  // parses each event's detail page and overrides this when the page says otherwise
  // (e.g. an "all ages" matinee), since scrapedEvent.ageRestriction wins over the default.
  defaultAgeRestriction: 'TWENTY_ONE_PLUS',
}

const EVENT_DETAILS_BASE = 'https://www.theheavyculture.coop/event-details-registration'
// Be polite between detail-page requests.
const DETAIL_FETCH_DELAY_MS = 300

// Shape of the Wix Events objects we read from the warmup-data JSON.
// Only the fields we consume are typed; everything else is ignored.
export interface WixWarmupEvent {
  id?: string
  title?: string
  description?: string
  about?: string
  slug?: string
  mainImage?: { url?: string }
  scheduling?: {
    config?: {
      startDate?: string
      endDate?: string
      endDateHidden?: boolean
    }
  }
  registration?: {
    ticketing?: {
      lowestPrice?: string
    }
  }
}

// A time of day parsed from description text, in 24h form.
export interface TimeOfDay {
  hours: number
  minutes: number
}

// Fields we enrich onto an event by fetching its detail page.
export interface EventDetail {
  description?: string
  coverCharge?: string
  ageRestriction?: ScrapedEvent['ageRestriction']
  // The actual performance time ("Music 8pm" / "Show 7pm"). The Wix start date is the
  // doors time, so we override startsAt with this when present.
  showTime?: TimeOfDay
  // The doors time ("Doors for show 7pm").
  doorsTime?: TimeOfDay
}

/**
 * Extract the JSON inside <script id="wix-warmup-data">...</script> and recursively
 * collect every Wix Events array (objects shaped { events: { events: [...] } }).
 * Dedupes the merged events by `id`. Returns [] if the block is missing/unparseable.
 */
export function extractWarmupEvents(html: string): WixWarmupEvent[] {
  const data = parseWarmupData(html)
  if (data === null) return []

  const collected: WixWarmupEvent[] = []
  const seen = new Set<string>()

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      const events = obj.events as Record<string, unknown> | undefined
      const inner = events?.events
      if (Array.isArray(inner)) {
        for (const ev of inner as WixWarmupEvent[]) {
          const key = ev?.id || ev?.slug
          if (!key) {
            console.warn(
              `[The Heavy Culture Cooperative] Skipping event with no id or slug: "${ev?.title}"`
            )
            continue
          }
          if (!seen.has(key)) {
            seen.add(key)
            collected.push(ev)
          }
        }
      }
      // Recurse into every value, including the collected events themselves: the same
      // event can appear in multiple widget arrays, and dedupe by key handles repeats.
      for (const value of Object.values(obj)) walk(value)
    }
  }

  walk(data)
  return collected
}

/**
 * Parse the JSON object inside <script id="wix-warmup-data">. Returns null when the
 * block is missing or unparseable.
 */
function parseWarmupData(html: string): unknown {
  const idAnchor = html.indexOf('id="wix-warmup-data"')
  if (idAnchor === -1) return null

  const open = html.indexOf('>', idAnchor)
  const close = html.indexOf('</script>', open)
  if (open === -1 || close === -1) return null

  const blob = html.slice(open + 1, close).trim()
  try {
    return JSON.parse(blob)
  } catch {
    return null
  }
}

/**
 * Collect, in document order, the text of every Ricos TEXT node under a rich-content
 * subtree. Used to flatten Wix's `longDescription` into readable lines.
 */
function collectRicosText(node: unknown): string[] {
  const lines: string[] = []
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const item of n) walk(item)
      return
    }
    if (n && typeof n === 'object') {
      const obj = n as Record<string, unknown>
      if (obj.type === 'TEXT' && obj.textData && typeof obj.textData === 'object') {
        const text = (obj.textData as { text?: string }).text
        if (text) lines.push(text)
      }
      for (const value of Object.values(obj)) walk(value)
    }
  }
  walk(node)
  return lines
}

/**
 * Parse an age restriction out of free-form event-description text.
 * THCC writes "21+", "18+", or "all ages" on a line of the description.
 */
export function parseAgeRestriction(text: string): ScrapedEvent['ageRestriction'] | undefined {
  if (/\ball\s*ages\b/i.test(text)) return 'ALL_AGES'
  if (/\b21\s*\+/.test(text)) return 'TWENTY_ONE_PLUS'
  if (/\b18\s*\+/.test(text)) return 'EIGHTEEN_PLUS'
  return undefined
}

/**
 * Parse a cover charge out of free-form event-description text. THCC advertises a
 * sliding-scale door price (e.g. "$10 - $20"), a flat price ("$10", "$5 per person"),
 * or "No Cover" / "Free". Returns the range/flat string as written, or "Free".
 */
export function parseCoverCharge(text: string): string | undefined {
  if (/\b(no cover|free admission|free entry|free)\b/i.test(text)) return 'Free'

  // Price range like "$10 - $20" or "$10-$20".
  const range = text.match(/\$\s*(\d+(?:\.\d{2})?)\s*-\s*\$?\s*(\d+(?:\.\d{2})?)/)
  if (range) return `$${range[1]} - $${range[2]}`

  // Single price like "$10" or "$5".
  const single = text.match(/\$\s*(\d+(?:\.\d{2})?)/)
  if (single) return `$${single[1]}`

  return undefined
}

/** Parse a clock time like "8pm", "7:30 pm", or "10:00 PM" into 24h hours/minutes. */
function parseClockTime(text: string): TimeOfDay | undefined {
  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!m) return undefined
  let hours = parseInt(m[1]!, 10)
  const minutes = m[2] ? parseInt(m[2], 10) : 0
  const meridiem = m[3]!.toLowerCase()
  if (meridiem === 'pm' && hours < 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0
  if (hours > 23 || minutes > 59) return undefined
  return { hours, minutes }
}

/**
 * Parse the performance ("show") time from description text. THCC writes the actual
 * music time as "Music 8pm" or "Show 7pm". The "Doors" line is deliberately excluded
 * so a doors time is never mistaken for the show time.
 */
export function parseShowTime(text: string): TimeOfDay | undefined {
  for (const line of text.split('\n')) {
    if (/door/i.test(line)) continue
    if (/\b(music|show)\b/i.test(line)) {
      const t = parseClockTime(line)
      if (t) return t
    }
  }
  return undefined
}

/** Parse the doors time from a "Doors ... <time>" line of the description. */
export function parseDoorsTime(text: string): TimeOfDay | undefined {
  for (const line of text.split('\n')) {
    if (/\bdoors?\b/i.test(line)) {
      const t = parseClockTime(line)
      if (t) return t
    }
  }
  return undefined
}

/**
 * Extract description, cover charge, and age restriction from an event detail page's
 * HTML. The detail page embeds the full event under
 * appsWarmupData.<appId>.EventsPageInitialState.event.event, whose `longDescription`
 * is a Ricos rich-content doc.
 */
export function extractEventDetail(html: string): EventDetail {
  const data = parseWarmupData(html)
  if (data === null) return {}

  // Find EventsPageInitialState.event.event anywhere under appsWarmupData.
  let eventNode: Record<string, unknown> | undefined
  const findEvent = (node: unknown): void => {
    if (eventNode) return
    if (Array.isArray(node)) {
      for (const item of node) findEvent(item)
      return
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      const state = obj.EventsPageInitialState as Record<string, unknown> | undefined
      const inner = (state?.event as Record<string, unknown> | undefined)?.event
      if (inner && typeof inner === 'object') {
        eventNode = inner as Record<string, unknown>
        return
      }
      for (const value of Object.values(obj)) findEvent(value)
    }
  }
  findEvent(data)
  if (!eventNode) return {}

  const lines = collectRicosText(eventNode.longDescription)
  const description = lines.join('\n').trim() || undefined
  const haystack = lines.join('\n')

  return {
    description,
    coverCharge: parseCoverCharge(haystack),
    ageRestriction: parseAgeRestriction(haystack),
    showTime: parseShowTime(haystack),
    doorsTime: parseDoorsTime(haystack),
  }
}

/**
 * Combine the calendar date of `baseDate` (the Wix start, which lands on the correct
 * local day) with a parsed local time of day, producing a UTC Date in `timezone`.
 */
export function applyTimeOfDay(baseDate: Date, time: TimeOfDay, timezone: string): Date {
  // Format the local Y-M-D for the base date in the venue timezone so we don't shift the
  // day when the UTC date and local date differ (e.g. a 23:00Z doors time = 7pm ET same day).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(baseDate) // "YYYY-MM-DD"
  const hh = String(time.hours).padStart(2, '0')
  const mm = String(time.minutes).padStart(2, '0')
  return fromZonedTime(`${parts}T${hh}:${mm}:00`, timezone)
}

/**
 * Map a raw Wix event to a ScrapedEvent. Returns null if it lacks a title or a
 * valid start date, or if the event is in the past relative to `now`.
 */
export function mapToScrapedEvent(raw: WixWarmupEvent, now: Date): ScrapedEvent | null {
  const title = (raw.title || '').trim()
  if (!title) return null

  const startRaw = raw.scheduling?.config?.startDate
  if (!startRaw) return null

  const startsAt = new Date(startRaw)
  if (isNaN(startsAt.getTime())) return null

  // Skip past events
  if (startsAt < now) return null

  const cfg = raw.scheduling?.config
  let endsAt: Date | undefined
  if (cfg?.endDate && !cfg.endDateHidden) {
    const parsed = new Date(cfg.endDate)
    if (!isNaN(parsed.getTime())) endsAt = parsed
  }

  const description = (raw.description || raw.about || '').trim() || undefined
  const imageUrl = raw.mainImage?.url || undefined

  // Advance-ticket price from the list data. The detail page's advertised door range
  // (e.g. "$10 - $20") is more accurate and overrides this during enrichment, but this
  // ensures priced events whose description omits a dollar amount still show a cover.
  const coverCharge = raw.registration?.ticketing?.lowestPrice || undefined

  // Prefer the stable Wix UUID for the source id; fall back to slug. extractWarmupEvents
  // only keeps events that have at least one of these, so idPart is always present.
  const idPart = raw.id || raw.slug
  const sourceEventId = `thcc-${idPart}`

  const sourceUrl = raw.slug ? `${EVENT_DETAILS_BASE}/${raw.slug}` : theHeavyCultureCoopConfig.url

  return {
    title,
    description,
    startsAt,
    endsAt,
    sourceUrl,
    sourceEventId,
    imageUrl,
    coverCharge,
  }
}

export class TheHeavyCultureCoopScraper extends HttpScraper {
  constructor() {
    super(theHeavyCultureCoopConfig)
  }

  override async scrape(): Promise<ScraperResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let events: ScrapedEvent[] = []

    try {
      const response = await fetch(this.config.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      events = await this.parseEvents(await response.text())

      // Enrich each event with description, cover charge, age, and the real show/doors
      // times from its detail page. The list page carries none of these, and its start
      // date is the doors time rather than the performance time.
      for (const event of events) {
        try {
          const detail = await this.fetchEventDetail(event.sourceUrl)
          if (detail.description) event.description = detail.description
          if (detail.coverCharge) event.coverCharge = detail.coverCharge
          if (detail.ageRestriction) event.ageRestriction = detail.ageRestriction
          // The Wix start date is doors; override with the stated music/show time and
          // record doors separately. The base date keeps the correct calendar day.
          if (detail.doorsTime) {
            event.doorsAt = applyTimeOfDay(event.startsAt, detail.doorsTime, this.config.timezone)
          }
          if (detail.showTime) {
            event.startsAt = applyTimeOfDay(event.startsAt, detail.showTime, this.config.timezone)
          }
        } catch (error) {
          // A failed detail fetch should not drop the event — we still have its
          // title/date/url from the list page.
          console.warn(
            `[${this.config.name}] Detail fetch failed for ${event.sourceUrl}:`,
            error instanceof Error ? error.message : error
          )
        }
        await new Promise((resolve) => setTimeout(resolve, DETAIL_FETCH_DELAY_MS))
      }

      console.log(`[${this.config.name}] Scraped ${events.length} events`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push(message)
      console.error(`[${this.config.name}] Scrape error:`, message)
    }

    return {
      success: errors.length === 0,
      events,
      errors,
      scrapedAt: new Date(),
      duration: Date.now() - startTime,
    }
  }

  private async fetchEventDetail(url: string): Promise<EventDetail> {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return extractEventDetail(await response.text())
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const raw = extractWarmupEvents(html)

    // No entries at all means the warmup-data block was missing or the embed format
    // changed. Throw so the run is marked failed and FailureDetectionService fires.
    // (A non-empty raw with no *future* events is a normal off-season state and is
    // left to the runner's own zero-events handling.)
    if (raw.length === 0) {
      throw new Error(
        'Found 0 events in wix-warmup-data block — embed format may have changed'
      )
    }

    const now = new Date()
    const events = raw
      .map((r) => mapToScrapedEvent(r, now))
      .filter((e): e is ScrapedEvent => e !== null)

    console.log(`[${this.config.name}] Parsed ${events.length} events`)
    return events
  }
}
