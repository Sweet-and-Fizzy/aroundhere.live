import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  applyTimeOfDay,
  extractEventDetail,
  extractWarmupEvents,
  mapToScrapedEvent,
  parseAgeRestriction,
  parseCoverCharge,
  parseDoorsTime,
  parseShowTime,
  TheHeavyCultureCoopScraper,
} from '../venues/the-heavy-culture-coop'
import type { WixWarmupEvent } from '../venues/the-heavy-culture-coop'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixture = readFileSync(join(fixturesDir, 'thcc-shows.html'), 'utf-8')
const detailFixture = readFileSync(
  join(fixturesDir, 'thcc-event-detail.html'),
  'utf-8'
)

describe('extractWarmupEvents', () => {
  it('extracts the Wix Events objects from the warmup-data block', () => {
    const events = extractWarmupEvents(fixture)
    // The live fixture has on the order of ~25 unique events.
    expect(events.length).toBeGreaterThanOrEqual(10)
  })

  it('dedupes events that appear in more than one widget array', () => {
    const events = extractWarmupEvents(fixture)
    const ids = events.map((e) => e.id).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every extracted event has a title, slug, and start date', () => {
    const events = extractWarmupEvents(fixture)
    for (const e of events) {
      expect(e.title, 'title').toBeTruthy()
      expect(e.slug, 'slug').toBeTruthy()
      expect(e.scheduling?.config?.startDate, 'startDate').toBeTruthy()
    }
  })

  it('returns [] when the warmup-data block is absent', () => {
    expect(extractWarmupEvents('<html><body>no data</body></html>')).toEqual([])
  })
})

describe('mapToScrapedEvent', () => {
  const base: WixWarmupEvent = {
    id: 'abc-123',
    title: 'Oxen / Problem With Dragons / Ash & Bone',
    slug: 'oxen-problem-with-dragons-ash-bone',
    mainImage: { url: 'https://static.wixstatic.com/media/x.png' },
    scheduling: {
      config: {
        startDate: '2999-06-06T23:00:00.000Z',
        endDate: '2999-06-07T03:00:00.000Z',
        endDateHidden: false,
      },
    },
  }
  const now = new Date('2026-06-08T00:00:00.000Z')

  it('maps a future event to a ScrapedEvent with all fields', () => {
    const e = mapToScrapedEvent(base, now)
    expect(e).not.toBeNull()
    expect(e!.title).toBe('Oxen / Problem With Dragons / Ash & Bone')
    expect(e!.startsAt.toISOString()).toBe('2999-06-06T23:00:00.000Z')
    expect(e!.endsAt?.toISOString()).toBe('2999-06-07T03:00:00.000Z')
    expect(e!.sourceUrl).toBe(
      'https://www.theheavyculture.coop/event-details-registration/oxen-problem-with-dragons-ash-bone'
    )
    expect(e!.sourceEventId).toBe('thcc-abc-123')
    expect(e!.imageUrl).toBe('https://static.wixstatic.com/media/x.png')
  })

  it('returns null for past events', () => {
    const past: WixWarmupEvent = {
      ...base,
      scheduling: { config: { startDate: '2020-01-01T00:00:00.000Z' } },
    }
    expect(mapToScrapedEvent(past, now)).toBeNull()
  })

  it('returns null when title or start date is missing', () => {
    expect(mapToScrapedEvent({ ...base, title: '' }, now)).toBeNull()
    expect(
      mapToScrapedEvent({ ...base, scheduling: { config: {} } }, now)
    ).toBeNull()
  })

  it('omits endsAt when endDateHidden is true', () => {
    const hidden: WixWarmupEvent = {
      ...base,
      scheduling: {
        config: {
          startDate: '2999-06-06T23:00:00.000Z',
          endDate: '2999-06-07T03:00:00.000Z',
          endDateHidden: true,
        },
      },
    }
    expect(mapToScrapedEvent(hidden, now)!.endsAt).toBeUndefined()
  })

  it('falls back to slug when id is absent for sourceEventId', () => {
    const noId: WixWarmupEvent = { ...base, id: undefined }
    expect(mapToScrapedEvent(noId, now)!.sourceEventId).toBe(
      'thcc-oxen-problem-with-dragons-ash-bone'
    )
  })

  it('sets coverCharge from the list ticketing.lowestPrice when present', () => {
    const priced: WixWarmupEvent = {
      ...base,
      registration: { ticketing: { lowestPrice: '$10.25' } },
    }
    expect(mapToScrapedEvent(priced, now)!.coverCharge).toBe('$10.25')
  })

  it('leaves coverCharge undefined when there is no list price', () => {
    expect(mapToScrapedEvent(base, now)!.coverCharge).toBeUndefined()
  })
})

describe('parseAgeRestriction', () => {
  it('detects 21+', () => {
    expect(parseAgeRestriction('Doors 7pm\n21+')).toBe('TWENTY_ONE_PLUS')
  })

  it('detects 18+', () => {
    expect(parseAgeRestriction('Music 8pm 18+ welcome')).toBe('EIGHTEEN_PLUS')
  })

  it('detects all ages and prefers it over a numeric mention', () => {
    expect(parseAgeRestriction('All Ages show')).toBe('ALL_AGES')
    expect(parseAgeRestriction('All ages, under 21 with guardian')).toBe('ALL_AGES')
  })

  it('returns undefined when no age is stated', () => {
    expect(parseAgeRestriction('Every second Thursday at 7pm')).toBeUndefined()
  })
})

describe('parseCoverCharge', () => {
  it('parses a sliding-scale range', () => {
    expect(parseCoverCharge('Music 8pm\n$10 - $20\n21+')).toBe('$10 - $20')
    expect(parseCoverCharge('$10-$20 at the door')).toBe('$10 - $20')
  })

  it('parses a single price', () => {
    expect(parseCoverCharge('Cover $10')).toBe('$10')
    expect(parseCoverCharge('$5 per person to play')).toBe('$5')
  })

  it('returns Free for no-cover language', () => {
    expect(parseCoverCharge('7pm\nNo Cover\n21+')).toBe('Free')
    expect(parseCoverCharge('Free admission')).toBe('Free')
  })

  it('returns undefined when no price is stated', () => {
    expect(parseCoverCharge('One night only')).toBeUndefined()
  })
})

describe('parseShowTime', () => {
  it('reads the music time, not the doors time', () => {
    const text = 'Bar opens 5pm\nDoors for show 7pm\nMusic 8pm'
    expect(parseShowTime(text)).toEqual({ hours: 20, minutes: 0 })
  })

  it('reads a "Show" time for events without a music line', () => {
    expect(parseShowTime('Show 7pm\nOne night only')).toEqual({ hours: 19, minutes: 0 })
  })

  it('handles minutes', () => {
    expect(parseShowTime('Music 7:30 pm')).toEqual({ hours: 19, minutes: 30 })
  })

  it('returns undefined when no music/show time is stated', () => {
    expect(parseShowTime('Every second Thursday @7pm')).toBeUndefined()
    expect(parseShowTime('Doors for show 7pm')).toBeUndefined()
  })
})

describe('parseDoorsTime', () => {
  it('reads the doors time', () => {
    expect(parseDoorsTime('Doors for show 7pm\nMusic 8pm')).toEqual({ hours: 19, minutes: 0 })
  })

  it('returns undefined when no doors line exists', () => {
    expect(parseDoorsTime('Music 8pm')).toBeUndefined()
  })
})

describe('applyTimeOfDay', () => {
  it('keeps the venue-local calendar day while setting the time', () => {
    // Wix doors time: 2026-06-12T23:00:00Z = Fri Jun 12, 7pm ET.
    const base = new Date('2026-06-12T23:00:00.000Z')
    const show = applyTimeOfDay(base, { hours: 20, minutes: 0 }, 'America/New_York')
    // 8pm ET on Jun 12 = 2026-06-13T00:00:00Z.
    expect(show.toISOString()).toBe('2026-06-13T00:00:00.000Z')
  })

  it('does not shift the day for an early-evening base time', () => {
    const base = new Date('2026-06-12T23:00:00.000Z') // Fri 7pm ET
    const doors = applyTimeOfDay(base, { hours: 19, minutes: 0 }, 'America/New_York')
    expect(doors.toISOString()).toBe('2026-06-12T23:00:00.000Z') // unchanged: 7pm ET
  })
})

describe('extractEventDetail', () => {
  it('pulls description, cover, age, and show/doors times from a real detail page', () => {
    const detail = extractEventDetail(detailFixture)
    expect(detail.description).toBeTruthy()
    expect(detail.description).toContain('Feminine Aggression')
    expect(detail.coverCharge).toBe('$10 - $20')
    expect(detail.ageRestriction).toBe('TWENTY_ONE_PLUS')
    expect(detail.showTime).toEqual({ hours: 20, minutes: 0 }) // Music 8pm
    expect(detail.doorsTime).toEqual({ hours: 19, minutes: 0 }) // Doors 7pm
  })

  it('returns an empty object when the warmup-data block is absent', () => {
    expect(extractEventDetail('<html><body>nope</body></html>')).toEqual({})
  })
})

describe('parseEvents (failure-detection contract)', () => {
  // parseEvents is protected; access it via a typed cast for the test.
  const callParse = (html: string) =>
    (
      new TheHeavyCultureCoopScraper() as unknown as {
        parseEvents(html: string): Promise<unknown>
      }
    ).parseEvents(html)

  it('throws when the warmup-data block is missing so the run is marked failed', async () => {
    await expect(callParse('<html><body>no data</body></html>')).rejects.toThrow(
      /embed format may have changed/
    )
  })

  it('does not throw for the real fixture (it has parseable raw entries)', async () => {
    // The fixture contains real warmup-data entries, so parseEvents must not hit the
    // broken-format throw — regardless of how many events are still future-dated by the
    // time this runs (the fixture ages, but the no-throw guarantee does not).
    const events = (await callParse(fixture)) as unknown[]
    expect(Array.isArray(events)).toBe(true)
  })
})
