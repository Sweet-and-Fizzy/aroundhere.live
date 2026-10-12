import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseHazeCalendar } from '../venues/haze'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixture = readFileSync(join(fixturesDir, 'haze-homepage.html'), 'utf-8')

describe('parseHazeCalendar', () => {
  const events = parseHazeCalendar(fixture)

  it('extracts events from the server-rendered calendar grid', () => {
    // The fixture month (October 2026) lists ~20 events
    expect(events.length).toBeGreaterThanOrEqual(10)
  })

  it('does not double-count events', () => {
    const ids = events.map(e => e.sourceEventId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('extracts known event titles, keeping the venue\'s own prefixes', () => {
    const titles = events.map(e => e.title)
    expect(titles).toContain('Game day!')
    expect(titles).toContain('Live show: with Jewel Thief, consumables, Ruby Lou and suprise guest')
  })

  it('takes the visible title, not an aria-label with a "Get tickets:" button prefix', () => {
    const titles = events.map(e => e.title)
    expect(titles).toContain('Live show with Evie echoes & the locations')
    expect(titles.some(t => t.startsWith('Get tickets'))).toBe(false)
  })

  it('parses the scraped date and time as UTC (site SSR renders UTC)', () => {
    // Scraped HTML lists Game day! in the 2026-10-11 cell at "7:00 PM"; the
    // hydrated calendar shows Sunday Oct 11 3:00 PM Eastern.
    const gameDay = events.find(e => e.title === 'Game day!' && e.sourceEventId?.includes('2026-10-11'))
    expect(gameDay).toBeDefined()
    expect(gameDay!.startsAt.toISOString()).toBe('2026-10-11T19:00:00.000Z')
  })

  it('recovers evening Eastern shows listed on the next UTC day', () => {
    // Scraped HTML lists Neal Liptak in the 2026-10-14 cell at "1:00 AM";
    // the hydrated calendar shows Tuesday Oct 13 9:00 PM Eastern.
    const neal = events.find(e => e.title === 'Neal Liptak')
    expect(neal).toBeDefined()
    expect(neal!.startsAt.toISOString()).toBe('2026-10-14T01:00:00.000Z')
    expect(neal!.sourceEventId).toBe('haze-2026-10-14-neal-liptak')
  })

  it('omits imageUrl because calendar images are short-lived signed URLs', () => {
    for (const e of events) {
      expect(e.imageUrl).toBeUndefined()
    }
  })

  it('returns nothing rather than throwing when the calendar is missing', () => {
    expect(parseHazeCalendar('<html><body><p>Coming soon</p></body></html>')).toEqual([])
  })
})
