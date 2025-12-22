import { describe, it, expect } from 'vitest'
import { similarityScore, isSameDay, mergeEventData } from '../dedup'
import type { ScrapedEvent } from '../types'

describe('similarityScore', () => {
  it('should return 1.0 for identical strings', () => {
    expect(similarityScore('Band Name', 'Band Name')).toBe(1.0)
  })

  it('should return 1.0 for strings that normalize to the same value', () => {
    expect(similarityScore('Band Name', 'BAND NAME')).toBe(1.0)
    expect(similarityScore('Rock & Roll', 'Rock &amp; Roll')).toBe(1.0)
    expect(similarityScore("Don't Stop", 'Dont Stop')).toBe(1.0)
  })

  it('should return high similarity for minor differences', () => {
    const score = similarityScore('The Rolling Stones', 'Rolling Stones')
    expect(score).toBeGreaterThan(0.7)
  })

  it('should return moderate similarity for similar names', () => {
    const score = similarityScore('John Smith Trio', 'John Smith & The Trio')
    expect(score).toBeGreaterThan(0.6)
  })

  it('should return low similarity for different names', () => {
    const score = similarityScore('The Beatles', 'Led Zeppelin')
    expect(score).toBeLessThan(0.5)
  })

  it('should handle empty strings', () => {
    expect(similarityScore('', '')).toBe(1.0)
    expect(similarityScore('Test', '')).toBeLessThan(0.5)
  })

  it('should handle special characters consistently', () => {
    // All punctuation is stripped, so these should be similar
    const score = similarityScore('Rock!!! Show', 'Rock Show')
    expect(score).toBeGreaterThan(0.9)
  })
})

describe('isSameDay', () => {
  it('should return true for same date', () => {
    const date1 = new Date('2025-12-20T19:00:00')
    const date2 = new Date('2025-12-20T21:00:00')
    expect(isSameDay(date1, date2)).toBe(true)
  })

  it('should return true for start and end of same day', () => {
    const date1 = new Date('2025-12-20T00:00:00')
    const date2 = new Date('2025-12-20T23:59:59')
    expect(isSameDay(date1, date2)).toBe(true)
  })

  it('should return false for different days', () => {
    const date1 = new Date('2025-12-20T19:00:00')
    const date2 = new Date('2025-12-21T19:00:00')
    expect(isSameDay(date1, date2)).toBe(false)
  })

  it('should return false for different months', () => {
    const date1 = new Date('2025-12-20T19:00:00')
    const date2 = new Date('2025-11-20T19:00:00')
    expect(isSameDay(date1, date2)).toBe(false)
  })

  it('should return false for different years', () => {
    const date1 = new Date('2025-12-20T19:00:00')
    const date2 = new Date('2024-12-20T19:00:00')
    expect(isSameDay(date1, date2)).toBe(false)
  })
})

describe('mergeEventData', () => {
  const createExistingEvent = (overrides = {}) => ({
    title: 'Event Title',
    description: null as string | null,
    imageUrl: null as string | null,
    coverCharge: null as string | null,
    ticketUrl: null as string | null,
    doorsAt: null as Date | null,
    endsAt: null as Date | null,
    ...overrides,
  })

  const createScrapedEvent = (overrides = {}): ScrapedEvent => ({
    title: 'Event Title',
    startsAt: new Date('2025-12-20T20:00:00'),
    sourceUrl: 'https://example.com/event',
    description: 'Scraped description',
    imageUrl: 'https://example.com/image.jpg',
    coverCharge: '$10',
    ticketUrl: 'https://tickets.example.com',
    doorsAt: new Date('2025-12-20T19:00:00'),
    endsAt: new Date('2025-12-20T23:00:00'),
    ...overrides,
  })

  it('should fill in missing fields', () => {
    const existing = createExistingEvent()
    const scraped = createScrapedEvent()

    const updates = mergeEventData(existing, scraped)

    expect(updates.description).toBe('Scraped description')
    expect(updates.imageUrl).toBe('https://example.com/image.jpg')
    expect(updates.coverCharge).toBe('$10')
    expect(updates.ticketUrl).toBe('https://tickets.example.com')
    expect(updates.doorsAt).toEqual(new Date('2025-12-20T19:00:00'))
    expect(updates.endsAt).toEqual(new Date('2025-12-20T23:00:00'))
  })

  it('should not override existing fields', () => {
    const existing = createExistingEvent({
      description: 'Existing description',
      imageUrl: 'https://existing.com/image.jpg',
    })
    const scraped = createScrapedEvent()

    const updates = mergeEventData(existing, scraped)

    expect(updates.description).toBeUndefined()
    expect(updates.imageUrl).toBeUndefined()
    expect(updates.coverCharge).toBe('$10') // Still filled since it was null
  })

  it('should return empty object when all fields exist', () => {
    const existing = createExistingEvent({
      description: 'Existing description',
      imageUrl: 'https://existing.com/image.jpg',
      coverCharge: '$15',
      ticketUrl: 'https://existing-tickets.com',
      doorsAt: new Date('2025-12-20T18:00:00'),
      endsAt: new Date('2025-12-20T22:00:00'),
    })
    const scraped = createScrapedEvent()

    const updates = mergeEventData(existing, scraped)

    expect(Object.keys(updates).length).toBe(0)
  })

  it('should handle scraped event with missing fields', () => {
    const existing = createExistingEvent()
    const scraped = createScrapedEvent({
      description: undefined,
      imageUrl: null,
    })

    const updates = mergeEventData(existing, scraped)

    expect(updates.description).toBeUndefined()
    expect(updates.imageUrl).toBeUndefined()
    // Other fields should still be filled
    expect(updates.coverCharge).toBe('$10')
  })
})

describe('similarity threshold behavior', () => {
  // These tests document the expected behavior at the 0.7 threshold
  it('should consider "The Rolling Stones" and "Rolling Stones" as duplicates', () => {
    const score = similarityScore('The Rolling Stones', 'Rolling Stones')
    expect(score).toBeGreaterThanOrEqual(0.7)
  })

  it('should consider "Jazz Jam Night" and "Jazz Jam" as duplicates (prefix match)', () => {
    // "Jazz Jam" is a prefix of "Jazz Jam Night"
    // With our improved algorithm, this is considered a likely duplicate
    // since one title is a significant prefix of the other
    const score = similarityScore('Jazz Jam Night', 'Jazz Jam')
    expect(score).toBeGreaterThanOrEqual(0.7)
  })

  it('should NOT consider "Open Mic Night" and "Comedy Night" as duplicates', () => {
    const score = similarityScore('Open Mic Night', 'Comedy Night')
    expect(score).toBeLessThan(0.7)
  })

  it('should consider identical events with different formatting as duplicates', () => {
    const score = similarityScore(
      'LIVE MUSIC: The Band - 8pm',
      'Live Music: The Band'
    )
    // After normalization, these should be very similar
    expect(score).toBeGreaterThanOrEqual(0.7)
  })
})
