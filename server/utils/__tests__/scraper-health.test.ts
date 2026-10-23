import { describe, it, expect } from 'vitest'
import { detectEventCollapse, findGoneQuiet, isWeeklyReminderDay, nextSilentSince, splitSilentScrapers } from '../scraper-health'

const DAY = 24 * 60 * 60 * 1000
const day = (iso: string) => new Date(`${iso}T12:00:00Z`)
const daysAfter = (start: string, n: number) => new Date(day(start).getTime() + n * DAY)

describe('detectEventCollapse', () => {
  it('flags a drop to zero when events we already have are still in the future', () => {
    expect(detectEventCollapse(21, 0, 18)).toBe(
      'Returned 0 upcoming events, but 18 already saved from this source are still in the future (previous run had 21)'
    )
  })

  it('treats a drop to zero as an empty calendar once every saved event has passed', () => {
    // A festival weekend: all the upcoming shows happened at once
    expect(detectEventCollapse(21, 0, 0)).toBeNull()
  })

  it('ignores venues that were already nearly empty', () => {
    expect(detectEventCollapse(2, 0, 2)).toBeNull()
  })

  it('ignores sources with no recorded history', () => {
    expect(detectEventCollapse(null, 0, 5)).toBeNull()
  })

  it('ignores runs that still return events', () => {
    expect(detectEventCollapse(40, 1, 39)).toBeNull()
  })
})

describe('findGoneQuiet', () => {
  // A venue that added events every 3 days for four months, then stopped
  const steady = Array.from({ length: 40 }, (_, i) => daysAfter('2026-04-01', i * 3))
  const lastSteady = steady[steady.length - 1]!

  it('flags a steady source that has gone quiet past the 30-day floor', () => {
    const now = new Date(lastSteady.getTime() + 31 * DAY)
    expect(findGoneQuiet(steady, now)).toEqual({ quietDays: 31, thresholdDays: 30 })
  })

  it('does not flag a steady source inside the threshold', () => {
    const now = new Date(lastSteady.getTime() + 29 * DAY)
    expect(findGoneQuiet(steady, now)).toBeNull()
  })

  it('scales the threshold to a slow cadence', () => {
    // New events every 20 days -> threshold 80 days
    const slow = Array.from({ length: 6 }, (_, i) => daysAfter('2026-01-01', i * 20))
    const last = slow[slow.length - 1]!
    expect(findGoneQuiet(slow, new Date(last.getTime() + 60 * DAY))).toBeNull()
    expect(findGoneQuiet(slow, new Date(last.getTime() + 81 * DAY))).toEqual({
      quietDays: 81,
      thresholdDays: 80,
    })
  })

  it('measures history back from the last new event, so long-dead sources stay flagged', () => {
    const now = new Date(lastSteady.getTime() + 300 * DAY)
    expect(findGoneQuiet(steady, now)?.quietDays).toBe(300)
  })

  it('needs at least 5 distinct days of history', () => {
    const burst = [day('2026-03-01'), day('2026-03-02'), day('2026-03-03'), day('2026-03-04')]
    expect(findGoneQuiet(burst, day('2026-09-01'))).toBeNull()
  })

  it('counts multiple events on one day as a single day', () => {
    const dupes = [...steady, ...steady]
    const now = new Date(lastSteady.getTime() + 31 * DAY)
    expect(findGoneQuiet(dupes, now)).toEqual({ quietDays: 31, thresholdDays: 30 })
  })

  it('returns null for a source with no events', () => {
    expect(findGoneQuiet([], day('2026-09-01'))).toBeNull()
  })
})

describe('nextSilentSince', () => {
  const now = day('2026-10-22')
  const earlier = day('2026-09-01')

  it('clears the marker when upcoming events come back', () => {
    expect(nextSilentSince({ silentSince: earlier, lastFoundCount: 5, lastRunStatus: 'success' }, 2, 8, now)).toBeNull()
  })

  it('starts the silent stretch on the first run with no upcoming events', () => {
    expect(nextSilentSince({ silentSince: null, lastFoundCount: 8, lastRunStatus: 'success' }, 0, 8, now)).toEqual(now)
  })

  it('keeps the original start while the page looks the same', () => {
    expect(nextSilentSince({ silentSince: earlier, lastFoundCount: 12, lastRunStatus: 'success' }, 0, 12, now)).toEqual(earlier)
    expect(nextSilentSince({ silentSince: earlier, lastFoundCount: 0, lastRunStatus: 'success' }, 0, 0, now)).toEqual(earlier)
  })

  it('restarts the stretch when the scraper stops seeing anything on the page', () => {
    expect(nextSilentSince({ silentSince: earlier, lastFoundCount: 12, lastRunStatus: 'success' }, 0, 0, now)).toEqual(now)
  })

  it('keeps the start when old events drop off the page', () => {
    expect(nextSilentSince({ silentSince: earlier, lastFoundCount: 12, lastRunStatus: 'success' }, 0, 9, now)).toEqual(earlier)
  })

  it('restarts the stretch when new entries appear but none are upcoming', () => {
    // The venue added shows we can't read, or the parser is misreading the page
    expect(nextSilentSince({ silentSince: earlier, lastFoundCount: 12, lastRunStatus: 'success' }, 0, 15, now)).toEqual(now)
  })

  it('restarts the stretch when a scraper comes back from failing with nothing upcoming', () => {
    expect(nextSilentSince({ silentSince: earlier, lastFoundCount: 12, lastRunStatus: 'failed' }, 0, 12, now)).toEqual(now)
  })

  it('keeps the start when the found count was never recorded', () => {
    expect(nextSilentSince({ silentSince: earlier, lastFoundCount: null, lastRunStatus: 'success' }, 0, 0, now)).toEqual(earlier)
  })
})

describe('splitSilentScrapers', () => {
  const now = day('2026-10-22')

  it('lists recent silences daily and long ones only in the weekly reminder', () => {
    const rows = [
      { slug: 'old', silentSince: daysAfter('2026-10-22', -30) },
      { slug: 'new', silentSince: daysAfter('2026-10-22', -2) },
      { slug: 'edge', silentSince: daysAfter('2026-10-22', -7) },
    ]
    const { recent, longQuiet } = splitSilentScrapers(rows, now)
    expect(recent.map(r => r.slug)).toEqual(['new', 'edge'])
    expect(longQuiet.map(r => r.slug)).toEqual(['old'])
  })

  it('treats an unknown start as recent so it is never hidden', () => {
    const { recent } = splitSilentScrapers([{ slug: 'x', silentSince: null }], now)
    expect(recent.map(r => r.slug)).toEqual(['x'])
  })
})

describe('isWeeklyReminderDay', () => {
  it('is Monday in Eastern time', () => {
    // 7am Eastern on Monday Oct 19 2026 is 11:00 UTC
    expect(isWeeklyReminderDay(new Date('2026-10-19T11:00:00Z'))).toBe(true)
    expect(isWeeklyReminderDay(new Date('2026-10-20T11:00:00Z'))).toBe(false)
  })

  it('uses the Eastern date, not UTC, near midnight', () => {
    // Sunday 10pm Eastern is already Monday in UTC
    expect(isWeeklyReminderDay(new Date('2026-10-19T02:00:00Z'))).toBe(false)
  })
})
