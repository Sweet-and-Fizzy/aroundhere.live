import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parseElfsightEvents, type ElfsightParseOptions } from '../platforms/elfsight'

const WIDGET_ID = 'c4b76df1-e520-4ed0-9318-f18bd056c38a'
const IRON_HORSE = 'e1912f9f-ec16-4a0e-a01c-a5bc84220db0'
const PARLOR_ROOM = 'fdad738b-571b-44b2-bee2-71e03b473e98'
const WORKSHOP = '84ea831a-3ccf-42c4-97ac-c607b67e21b3'

const boot = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/elfsight-boot.json'), 'utf8'))
const rawEvents = boot.data.widgets[WIDGET_ID].data.settings.events as Array<{
  id: string
  name: string
  actions: Array<{ link?: { value?: string } }>
  coverImage: { url: string }
}>
const raw = (name: string) => rawEvents.find(e => e.name.startsWith(name))!

const options = (locationId: string, idPrefix: string): ElfsightParseOptions => ({
  widgetId: WIDGET_ID,
  locationId,
  timezone: 'America/New_York',
  idPrefix,
  fallbackUrl: 'https://www.ironhorse.org/shows',
  now: new Date('2026-09-29T12:00:00Z'),
})

describe('parseElfsightEvents', () => {
  it('returns only upcoming events at the requested location', () => {
    const events = parseElfsightEvents(boot, options(IRON_HORSE, 'iron-horse'))
    expect(events.map(e => e.title)).toEqual([
      'Oliver Wood w/ Ric Robertson',
      'Student Jazz Workshop & Jam Sessions (Showcase)',
    ])
  })

  it('maps a ticketed show', () => {
    const [oliver] = parseElfsightEvents(boot, options(IRON_HORSE, 'iron-horse'))
    const source = raw('Oliver Wood')
    const ticketLink = source.actions[0]!.link!.value

    expect(oliver).toMatchObject({
      startsAt: new Date('2026-09-30T23:00:00Z'),
      sourceEventId: `iron-horse-elfsight-${source.id}`,
      ticketUrl: ticketLink,
      sourceUrl: ticketLink,
      coverCharge: '$30',
      imageUrl: source.coverImage.url,
    })
    expect(oliver!.genres).toEqual(expect.arrayContaining(['Rock', 'Blues', 'Americana']))
    expect(oliver!.description).toContain('<')
  })

  it('handles the legacy US/Eastern zone name', () => {
    const [rachel] = parseElfsightEvents(boot, options(PARLOR_ROOM, 'parlor-room'))
    expect(rachel!.startsAt).toEqual(new Date('2026-10-25T23:30:00Z'))
    expect(rachel!.sourceEventId).toBe(`parlor-room-elfsight-${raw('Rachel Sumner').id}`)
  })

  it('treats free captions as Free, drops promo labels from genres, and falls back without a ticket link', () => {
    const events = parseElfsightEvents(boot, options(IRON_HORSE, 'iron-horse'))
    const jazz = events.find(e => e.title.startsWith('Student Jazz'))!
    expect(jazz.coverCharge).toBe('Free')
    expect(jazz.genres).toEqual(['Open Mic'])
    expect(jazz.ticketUrl).toBeUndefined()
    expect(jazz.sourceUrl).toBe('https://www.ironhorse.org/shows')
  })

  it('skips shows the venue has marked cancelled or postponed, so they get canceled as missing', () => {
    const settings = boot.data.widgets[WIDGET_ID].data.settings
    const oliver = raw('Oliver Wood')
    const marked = {
      ...boot,
      data: {
        widgets: {
          [WIDGET_ID]: {
            status: 1,
            data: {
              settings: {
                ...settings,
                events: [
                  { ...oliver, id: 'a', name: 'CANCELLED - Robert Ellis w/ Alicia Blue' },
                  { ...oliver, id: 'b', name: 'Canceled: Someone' },
                  { ...oliver, id: 'c', name: 'POSTPONED - Another Band' },
                  { ...oliver, id: 'd', name: 'Cancelled Plans (band name)' },
                ],
              },
            },
          },
        },
      },
    }
    expect(parseElfsightEvents(marked, options(IRON_HORSE, 'iron-horse')).map(e => e.title)).toEqual([
      'Cancelled Plans (band name)',
    ])
  })

  it('skips repeating events', () => {
    expect(parseElfsightEvents(boot, options(WORKSHOP, 'workshop'))).toEqual([])
  })

  it('throws when the widget is gone, instead of returning zero events', () => {
    const gone = { status: 1, data: { widgets: { [WIDGET_ID]: { status: 0, reason: 'WIDGET_NOT_FOUND' } } } }
    expect(() => parseElfsightEvents(gone, options(IRON_HORSE, 'iron-horse'))).toThrow(
      'Elfsight widget c4b76df1-e520-4ed0-9318-f18bd056c38a unavailable: WIDGET_NOT_FOUND'
    )
  })

  it('throws when the location no longer exists in the widget', () => {
    expect(() => parseElfsightEvents(boot, options('missing-location', 'x'))).toThrow(
      'Elfsight location missing-location not found'
    )
  })
})
