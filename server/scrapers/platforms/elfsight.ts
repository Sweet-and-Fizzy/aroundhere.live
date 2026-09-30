import { fromZonedTime } from 'date-fns-tz'
import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'
import { decodeHtmlEntities } from '../../utils/html'

export interface ElfsightScraperConfig extends ScraperConfig {
  widgetId: string
  // One widget can hold several venues; only events at this location are kept
  locationId: string
}

export interface ElfsightParseOptions {
  widgetId: string
  locationId: string
  timezone: string
  idPrefix: string
  fallbackUrl: string
  now: Date
}

interface ElfsightEvent {
  id: string
  name?: string
  start?: { date?: string; time?: string }
  end?: { date?: string; time?: string }
  timeZone?: string
  description?: string
  coverImage?: { url?: string }
  images?: Array<{ url?: string }>
  eventType?: string[]
  location?: string[]
  actions?: Array<{ type?: string; link?: { value?: string } }>
  actionsCaption?: string
  repeatPeriod?: string
  visible?: boolean
}

interface ElfsightSettings {
  events?: ElfsightEvent[]
  locations?: Array<{ id: string }>
  eventTypes?: Array<{ id: string; name: string }>
}

// All-caps event types are series/promo labels ("SECRET PLANET", "FREE EVENT"),
// not genres. Short ones like "DJ" and "R&B" are real genres.
const isPromoLabel = (name: string) => name.length > 3 && name === name.toUpperCase()

// The venue marks dropped shows in the title ("CANCELLED - Band"). Skipping them
// lets the missing-event pass mark our copy canceled. The separator keeps a band
// named "Cancelled Plans" from matching.
const CANCELLED_TITLE = /^\s*(cancell?ed|postponed)\s*[-:–—|]/i

function parsePrice(caption: string | undefined): string | undefined {
  if (!caption) return undefined
  const price = caption.match(/\$(\d+(?:\.\d{2})?)/)
  if (price) return `$${price[1]}`
  if (/\bfree\b/i.test(caption)) return 'Free'
  return undefined
}

/**
 * Convert an Elfsight Event Calendar boot response into scraped events for one
 * location. Throws when the widget or location is gone so a dead calendar fails
 * loudly instead of returning zero events. Exported for testing.
 */
export function parseElfsightEvents(boot: unknown, options: ElfsightParseOptions): ScrapedEvent[] {
  const widget = (boot as { data?: { widgets?: Record<string, unknown> } })?.data?.widgets?.[
    options.widgetId
  ] as { status?: number; reason?: string; data?: { settings?: ElfsightSettings } } | undefined
  const settings = widget?.data?.settings
  if (!widget || widget.status !== 1 || !settings) {
    throw new Error(
      `Elfsight widget ${options.widgetId} unavailable: ${widget?.reason || 'missing from response'}`
    )
  }
  if (!settings.locations?.some(location => location.id === options.locationId)) {
    throw new Error(`Elfsight location ${options.locationId} not found in widget ${options.widgetId}`)
  }

  const typeNames = new Map((settings.eventTypes || []).map(type => [type.id, type.name]))
  const events: ScrapedEvent[] = []

  for (const event of settings.events || []) {
    if (event.visible === false || !event.location?.includes(options.locationId)) continue
    // Repeating entries (weekly classes) would need occurrence expansion; none are shows
    if (event.repeatPeriod && event.repeatPeriod !== 'noRepeat') continue
    if (!event.name || !event.start?.date) continue
    if (CANCELLED_TITLE.test(event.name)) continue

    const timezone = event.timeZone || options.timezone
    const startsAt = fromZonedTime(`${event.start.date}T${event.start.time || '20:00'}:00`, timezone)
    if (isNaN(startsAt.getTime()) || startsAt < options.now) continue

    let endsAt: Date | undefined
    if (event.end?.date && event.end.time) {
      const end = fromZonedTime(`${event.end.date}T${event.end.time}:00`, timezone)
      if (end > startsAt) endsAt = end
    }

    const ticketUrl = event.actions?.find(action => action.type === 'link' && action.link?.value)
      ?.link?.value
    const genres = (event.eventType || [])
      .map(id => typeNames.get(id))
      .filter((name): name is string => !!name && !isPromoLabel(name))

    events.push({
      title: decodeHtmlEntities(event.name).trim(),
      description: event.description || undefined,
      imageUrl: event.coverImage?.url || event.images?.[0]?.url || undefined,
      startsAt,
      endsAt,
      sourceUrl: ticketUrl || options.fallbackUrl,
      sourceEventId: `${options.idPrefix}-elfsight-${event.id}`,
      ticketUrl,
      coverCharge: parsePrice(event.actionsCaption),
      genres: genres.length > 0 ? genres : undefined,
    })
  }

  return events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/**
 * Scraper for venues whose calendar is an Elfsight Event Calendar widget.
 * Reads the widget's boot JSON directly, so no browser is needed.
 */
export abstract class ElfsightScraper extends HttpScraper {
  protected widgetId: string
  protected locationId: string

  constructor(config: ElfsightScraperConfig) {
    super(config)
    this.widgetId = config.widgetId
    this.locationId = config.locationId
  }

  protected override fetchUrl(): string {
    return `https://core.service.elfsight.com/p/boot/?w=${this.widgetId}`
  }

  protected async parseEvents(body: string): Promise<ScrapedEvent[]> {
    return parseElfsightEvents(JSON.parse(body), {
      widgetId: this.widgetId,
      locationId: this.locationId,
      timezone: this.config.timezone,
      idPrefix: this.config.id,
      fallbackUrl: this.config.url,
      now: new Date(),
    })
  }
}
