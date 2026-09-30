import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'
import { describe, it, expect } from 'vitest'
import { extractStoryDescription, parseDeLaLuzStartDate } from '../venues/de-la-luz'

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures/delaluz-event-detail.html'),
  'utf-8'
)

describe('parseDeLaLuzStartDate', () => {
  it('uses a real ISO timestamp as-is', () => {
    expect(parseDeLaLuzStartDate('2026-10-04T23:00:00.000Z', 'America/New_York')).toEqual(
      new Date('2026-10-04T23:00:00.000Z')
    )
  })

  it('reads the Unix timestamp from the legacy WordPress format', () => {
    expect(parseDeLaLuzStartDate('2025-11-22T1763856000America/New_York', 'America/New_York')).toEqual(
      new Date(1763856000 * 1000)
    )
  })

  it('defaults a bare date to 7pm in the venue timezone, not the server timezone', () => {
    expect(parseDeLaLuzStartDate('2026-10-04', 'America/New_York')).toEqual(
      new Date('2026-10-04T23:00:00.000Z')
    )
  })

  it('returns null for garbage', () => {
    expect(parseDeLaLuzStartDate('TBA', 'America/New_York')).toBeNull()
  })
})

describe('extractStoryDescription', () => {
  it('joins the hook and every story block from the event page', () => {
    const description = extractStoryDescription(cheerio.load(fixture))!
    expect(description).toContain('Old songs. Deep roots. A new voice for Louisiana.')
    expect(description).toContain('There are histories hidden inside the sound of a fiddle.')
    expect(description).toContain('Cedric Watson has spent much of his life following those threads.')
    expect(cheerio.load(description).text().length).toBeGreaterThan(1500)
  })

  it('returns undefined when the page has no story', () => {
    expect(extractStoryDescription(cheerio.load('<html><body><h1>Show</h1></body></html>'))).toBeUndefined()
  })
})
