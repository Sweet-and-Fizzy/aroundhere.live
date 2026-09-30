import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parseProgressionDetail } from '../venues/progression-brewing'

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures/progression-event-detail.html'),
  'utf-8'
)

describe('parseProgressionDetail', () => {
  it('reads the description from the MEC content block', () => {
    const { description } = parseProgressionDetail(fixture)
    expect(description).toContain('Free Live Music')
    expect(description).toContain('18+ After 7pm')
  })

  it('reads the real image URL from the lazy-load attribute, not the SVG placeholder', () => {
    expect(parseProgressionDetail(fixture).imageUrl).toBe(
      'https://progressionbrewing.com/wp-content/uploads/2026/05/underwater-10-24-26.jpg'
    )
  })

  it('marks free live music nights as Free', () => {
    expect(parseProgressionDetail(fixture).coverCharge).toBe('Free')
  })

  it('still reads an LD+JSON Event when present', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Event',
      description: 'Trivia night',
      image: 'https://example.com/trivia.jpg',
    })}</script>`
    expect(parseProgressionDetail(html)).toEqual({
      description: 'Trivia night',
      imageUrl: 'https://example.com/trivia.jpg',
      coverCharge: undefined,
    })
  })

  it('returns nothing for a page without event content', () => {
    expect(parseProgressionDetail('<html><body></body></html>')).toEqual({
      description: undefined,
      imageUrl: undefined,
      coverCharge: undefined,
    })
  })
})
