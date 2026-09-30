import { describe, it, expect } from 'vitest'
import { detectEventCollapse, findGoneQuiet } from '../scraper-health'

const DAY = 24 * 60 * 60 * 1000
const day = (iso: string) => new Date(`${iso}T12:00:00Z`)
const daysAfter = (start: string, n: number) => new Date(day(start).getTime() + n * DAY)

describe('detectEventCollapse', () => {
  it('flags a drop to zero from a healthy previous run', () => {
    expect(detectEventCollapse(21, 0)).toBe('Returned 0 upcoming events (previous run had 21)')
  })

  it('ignores venues that were already nearly empty', () => {
    expect(detectEventCollapse(2, 0)).toBeNull()
  })

  it('ignores sources with no recorded history', () => {
    expect(detectEventCollapse(null, 0)).toBeNull()
  })

  it('ignores runs that still return events', () => {
    expect(detectEventCollapse(40, 1)).toBeNull()
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
