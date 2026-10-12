import { describe, it, expect } from 'vitest'
import { upcomingStartDate, recommendationWindow } from '../chat-dates'

const tz = 'America/New_York'
// Sunday Oct 11 2026, 6pm EDT (already Monday in UTC)
const sundayEvening = new Date('2026-10-11T22:00:00Z')

describe('upcomingStartDate', () => {
  it('moves a past start date up to today in the region timezone', () => {
    // "this weekend" asked on Sunday evening: the model sends Saturday
    expect(upcomingStartDate('2026-10-10', sundayEvening, tz)).toBe('2026-10-11')
  })

  it('keeps today and future start dates', () => {
    expect(upcomingStartDate('2026-10-11', sundayEvening, tz)).toBe('2026-10-11')
    expect(upcomingStartDate('2026-11-01', sundayEvening, tz)).toBe('2026-11-01')
  })

  it('uses the region date, not the UTC date', () => {
    // 8pm EDT Oct 11 is Oct 12 in UTC; a request for the 12th is still tomorrow
    const lateSunday = new Date('2026-10-12T00:30:00Z')
    expect(upcomingStartDate('2026-10-11', lateSunday, tz)).toBe('2026-10-11')
  })

  it('leaves the start unset when none was given', () => {
    expect(upcomingStartDate(undefined, sundayEvening, tz)).toBeUndefined()
  })

  it('drops a malformed date rather than passing it through', () => {
    expect(upcomingStartDate('next saturday', sundayEvening, tz)).toBeUndefined()
  })
})

describe('recommendationWindow', () => {
  it('ends at the end of the last day in the region, so evening shows count', () => {
    const { end } = recommendationWindow('2026-10-17', '2026-10-17', sundayEvening, tz)
    expect(end.toISOString()).toBe('2026-10-18T03:59:59.999Z')
  })

  it('starts at the start of a future day in the region', () => {
    const { start } = recommendationWindow('2026-10-17', '2026-10-18', sundayEvening, tz)
    expect(start.toISOString()).toBe('2026-10-17T04:00:00.000Z')
  })

  it('never starts in the past', () => {
    const { start } = recommendationWindow('2026-10-10', '2026-10-11', sundayEvening, tz)
    expect(start).toEqual(sundayEvening)
  })

  it('defaults to now through two weeks out', () => {
    const { start, end } = recommendationWindow(undefined, undefined, sundayEvening, tz)
    expect(start).toEqual(sundayEvening)
    expect(end.toISOString()).toBe('2026-10-25T22:00:00.000Z')
  })
})
