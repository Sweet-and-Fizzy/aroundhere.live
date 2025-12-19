import { describe, it, expect } from 'vitest'
import {
  analyzeEventFields,
  findMissingRequiredFields,
  getSampleEvents,
  type ScrapedEvent,
} from '../scraper-analysis'

describe('analyzeEventFields', () => {
  describe('with complete data', () => {
    it('should return perfect scores for fully populated events', () => {
      const events: ScrapedEvent[] = [
        {
          title: 'Live Music Night',
          startsAt: '2025-01-15T20:00:00Z',
          sourceUrl: 'https://venue.com/event1',
          description: 'Great show',
          coverCharge: '$10',
          imageUrl: 'https://venue.com/image.jpg',
          doorsAt: '2025-01-15T19:00:00Z',
          endsAt: '2025-01-15T23:00:00Z',
          ticketUrl: 'https://tickets.com',
          genres: ['Rock', 'Blues'],
          artists: ['Band Name'],
          ageRestriction: '21+',
        },
      ]

      const analysis = analyzeEventFields(events)

      expect(analysis.completenessScore).toBe(1) // Perfect score
      expect(analysis.requiredFieldsCoverage).toBe(1) // 100%
      expect(analysis.optionalFieldsCoverage).toBe(1) // 100%

      // All fields should have 100% coverage
      Object.values(analysis.coverage).forEach(field => {
        expect(field.percentage).toBe(100)
        expect(field.count).toBe(1)
      })
    })

    it('should handle multiple fully populated events', () => {
      const events: ScrapedEvent[] = [
        {
          title: 'Event 1',
          startsAt: '2025-01-15',
          sourceUrl: 'https://venue.com/1',
          description: 'Desc 1',
        },
        {
          title: 'Event 2',
          startsAt: '2025-01-16',
          sourceUrl: 'https://venue.com/2',
          description: 'Desc 2',
        },
      ]

      const analysis = analyzeEventFields(events)

      expect(analysis.coverage.title.count).toBe(2)
      expect(analysis.coverage.title.percentage).toBe(100)
      expect(analysis.requiredFieldsCoverage).toBe(1) // All required fields present
    })
  })

  describe('with missing required fields', () => {
    it('should detect missing title', () => {
      const events: ScrapedEvent[] = [
        {
          startsAt: '2025-01-15',
          sourceUrl: 'https://venue.com/1',
        },
        {
          title: 'Event 2',
          startsAt: '2025-01-16',
          sourceUrl: 'https://venue.com/2',
        },
      ]

      const analysis = analyzeEventFields(events)

      expect(analysis.coverage.title.count).toBe(1)
      expect(analysis.coverage.title.percentage).toBe(50)
      expect(analysis.requiredFieldsCoverage).toBeLessThan(1)
    })

    it('should penalize completeness score when required fields missing', () => {
      const events: ScrapedEvent[] = [
        {
          title: 'Event',
          // Missing startsAt and sourceUrl
        },
      ]

      const analysis = analyzeEventFields(events)

      expect(analysis.coverage.startsAt.percentage).toBe(0)
      expect(analysis.coverage.sourceUrl.percentage).toBe(0)
      // Required fields are weighted 70%, so missing 2/3 required fields hurts the score significantly
      expect(analysis.completenessScore).toBeLessThan(0.5)
    })
  })

  describe('with optional fields', () => {
    it('should not penalize missing optional fields as heavily', () => {
      const eventsWithRequired: ScrapedEvent[] = [
        {
          title: 'Event',
          startsAt: '2025-01-15',
          sourceUrl: 'https://venue.com/1',
          // No optional fields
        },
      ]

      const analysis = analyzeEventFields(eventsWithRequired)

      // Has all required fields (100%)
      expect(analysis.requiredFieldsCoverage).toBe(1)
      // Has no optional fields (0%)
      expect(analysis.optionalFieldsCoverage).toBe(0)
      // Overall: 70% * 1.0 + 30% * 0.0 = 0.7
      expect(analysis.completenessScore).toBeCloseTo(0.7, 2)
    })

    it('should improve score with optional fields', () => {
      const events: ScrapedEvent[] = [
        {
          title: 'Event',
          startsAt: '2025-01-15',
          sourceUrl: 'https://venue.com/1',
          description: 'Great event',
          coverCharge: '$10',
          imageUrl: 'https://image.com/1.jpg',
        },
      ]

      const analysis = analyzeEventFields(events)

      expect(analysis.optionalFieldsCoverage).toBeGreaterThan(0)
      expect(analysis.completenessScore).toBeGreaterThan(0.7) // Better than required-only
    })
  })

  describe('with empty or invalid values', () => {
    it('should not count null values', () => {
      const events: ScrapedEvent[] = [
        {
          title: null,
          startsAt: '2025-01-15',
          sourceUrl: 'https://venue.com/1',
        },
      ]

      const analysis = analyzeEventFields(events)
      expect(analysis.coverage.title.count).toBe(0)
      expect(analysis.coverage.title.percentage).toBe(0)
    })

    it('should not count empty strings', () => {
      const events: ScrapedEvent[] = [
        {
          title: '   ', // Whitespace only
          startsAt: '',
          sourceUrl: 'https://venue.com/1',
        },
      ]

      const analysis = analyzeEventFields(events)
      expect(analysis.coverage.title.count).toBe(0)
      expect(analysis.coverage.startsAt.count).toBe(0)
    })

    it('should not count empty arrays', () => {
      const events: ScrapedEvent[] = [
        {
          title: 'Event',
          startsAt: '2025-01-15',
          sourceUrl: 'https://venue.com/1',
          genres: [],
          artists: [],
        },
      ]

      const analysis = analyzeEventFields(events)
      expect(analysis.coverage.genres.count).toBe(0)
      expect(analysis.coverage.artists.count).toBe(0)
    })

    it('should count arrays with values', () => {
      const events: ScrapedEvent[] = [
        {
          title: 'Event',
          startsAt: '2025-01-15',
          sourceUrl: 'https://venue.com/1',
          genres: ['Rock'],
          artists: ['Band Name'],
        },
      ]

      const analysis = analyzeEventFields(events)
      expect(analysis.coverage.genres.count).toBe(1)
      expect(analysis.coverage.artists.count).toBe(1)
    })
  })

  describe('with empty or invalid input', () => {
    it('should handle empty array', () => {
      const analysis = analyzeEventFields([])

      expect(analysis.completenessScore).toBe(0)
      expect(analysis.requiredFieldsCoverage).toBe(0)
      expect(analysis.optionalFieldsCoverage).toBe(0)
      expect(Object.keys(analysis.coverage)).toHaveLength(0)
    })

    it('should handle null input', () => {
      const analysis = analyzeEventFields(null as never)

      expect(analysis.completenessScore).toBe(0)
    })

    it('should handle undefined input', () => {
      const analysis = analyzeEventFields(undefined as never)

      expect(analysis.completenessScore).toBe(0)
    })
  })

  describe('coverage calculations', () => {
    it('should calculate correct percentages for partial coverage', () => {
      const events: ScrapedEvent[] = [
        { title: 'E1', startsAt: '2025-01-15', sourceUrl: 'url1' },
        { title: 'E2', startsAt: '2025-01-16', sourceUrl: 'url2' },
        { title: null, startsAt: '2025-01-17', sourceUrl: 'url3' }, // Missing title
        { title: 'E4', startsAt: null, sourceUrl: 'url4' }, // Missing startsAt
      ]

      const analysis = analyzeEventFields(events)

      expect(analysis.coverage.title.count).toBe(3)
      expect(analysis.coverage.title.percentage).toBe(75) // 3/4 = 75%
      expect(analysis.coverage.startsAt.count).toBe(3)
      expect(analysis.coverage.startsAt.percentage).toBe(75)
      expect(analysis.coverage.sourceUrl.count).toBe(4)
      expect(analysis.coverage.sourceUrl.percentage).toBe(100)
    })

    it('should mark required vs optional fields correctly', () => {
      const events: ScrapedEvent[] = [
        {
          title: 'Event',
          startsAt: '2025-01-15',
          sourceUrl: 'https://venue.com/1',
        },
      ]

      const analysis = analyzeEventFields(events)

      // Required fields
      expect(analysis.coverage.title.isRequired).toBe(true)
      expect(analysis.coverage.startsAt.isRequired).toBe(true)
      expect(analysis.coverage.sourceUrl.isRequired).toBe(true)

      // Optional fields
      expect(analysis.coverage.description.isRequired).toBe(false)
      expect(analysis.coverage.coverCharge.isRequired).toBe(false)
      expect(analysis.coverage.imageUrl.isRequired).toBe(false)
    })
  })
})

describe('findMissingRequiredFields', () => {
  it('should return empty array when all required fields present', () => {
    const events: ScrapedEvent[] = [
      {
        title: 'Event',
        startsAt: '2025-01-15',
        sourceUrl: 'https://venue.com/1',
      },
    ]

    const missing = findMissingRequiredFields(events)
    expect(missing).toEqual([])
  })

  it('should identify missing title', () => {
    const events: ScrapedEvent[] = [
      {
        startsAt: '2025-01-15',
        sourceUrl: 'https://venue.com/1',
      },
    ]

    const missing = findMissingRequiredFields(events)
    expect(missing).toContain('title')
  })

  it('should identify multiple missing required fields', () => {
    const events: ScrapedEvent[] = [
      {
        title: 'Event',
        // Missing startsAt and sourceUrl
      },
    ]

    const missing = findMissingRequiredFields(events)
    expect(missing).toContain('startsAt')
    expect(missing).toContain('sourceUrl')
    expect(missing).not.toContain('title')
  })

  it('should identify partially missing fields across events', () => {
    const events: ScrapedEvent[] = [
      { title: 'E1', startsAt: '2025-01-15', sourceUrl: 'url1' },
      { title: null, startsAt: '2025-01-16', sourceUrl: 'url2' }, // Missing title
    ]

    const missing = findMissingRequiredFields(events)
    expect(missing).toContain('title') // Not 100% coverage
    expect(missing).not.toContain('startsAt')
    expect(missing).not.toContain('sourceUrl')
  })

  it('should handle empty array', () => {
    const missing = findMissingRequiredFields([])
    expect(missing).toEqual([])
  })

  it('should not include optional fields', () => {
    const events: ScrapedEvent[] = [
      {
        title: 'Event',
        startsAt: '2025-01-15',
        sourceUrl: 'https://venue.com/1',
        // Missing all optional fields
      },
    ]

    const missing = findMissingRequiredFields(events)
    expect(missing).not.toContain('description')
    expect(missing).not.toContain('coverCharge')
    expect(missing).not.toContain('imageUrl')
  })
})

describe('getSampleEvents', () => {
  it('should return all events when count is less than limit', () => {
    const events: ScrapedEvent[] = [
      { title: 'E1', startsAt: '2025-01-15', sourceUrl: 'url1' },
      { title: 'E2', startsAt: '2025-01-16', sourceUrl: 'url2' },
    ]

    const sample = getSampleEvents(events, 5)
    expect(sample).toHaveLength(2)
  })

  it('should return exactly limit events when more available', () => {
    const events: ScrapedEvent[] = Array.from({ length: 10 }, (_, i) => ({
      title: `Event ${i}`,
      startsAt: '2025-01-15',
      sourceUrl: `url${i}`,
    }))

    const sample = getSampleEvents(events, 3)
    expect(sample).toHaveLength(3)
  })

  it('should prioritize events with better field coverage', () => {
    const events: ScrapedEvent[] = [
      { title: 'Minimal', startsAt: '2025-01-15', sourceUrl: 'url1' },
      {
        title: 'Complete',
        startsAt: '2025-01-15',
        sourceUrl: 'url2',
        description: 'Full description',
        coverCharge: '$10',
        imageUrl: 'https://image.com',
        genres: ['Rock'],
        artists: ['Band'],
      },
      { title: 'Medium', startsAt: '2025-01-15', sourceUrl: 'url3', description: 'Some info' },
    ]

    const sample = getSampleEvents(events, 2)
    expect(sample).toHaveLength(2)
    // First event should be the most complete one
    expect(sample[0].title).toBe('Complete')
  })

  it('should handle default limit of 5', () => {
    const events: ScrapedEvent[] = Array.from({ length: 10 }, (_, i) => ({
      title: `Event ${i}`,
      startsAt: '2025-01-15',
      sourceUrl: `url${i}`,
    }))

    const sample = getSampleEvents(events)
    expect(sample).toHaveLength(5) // Default limit
  })

  it('should handle empty array', () => {
    const sample = getSampleEvents([])
    expect(sample).toEqual([])
  })

  it('should maintain event object structure', () => {
    const events: ScrapedEvent[] = [
      {
        title: 'Event',
        startsAt: '2025-01-15',
        sourceUrl: 'url',
        description: 'Test',
      },
    ]

    const sample = getSampleEvents(events, 1)
    expect(sample[0]).toHaveProperty('title')
    expect(sample[0]).toHaveProperty('startsAt')
    expect(sample[0]).toHaveProperty('sourceUrl')
    expect(sample[0]).toHaveProperty('description')
  })

  it('should score events by total field coverage', () => {
    const minimalEvent: ScrapedEvent = {
      title: 'Minimal',
      startsAt: '2025-01-15',
      sourceUrl: 'url1',
    }

    const completeEvent: ScrapedEvent = {
      title: 'Complete',
      startsAt: '2025-01-15',
      sourceUrl: 'url2',
      description: 'Full description',
      coverCharge: '$10',
      imageUrl: 'https://image.com',
      doorsAt: '2025-01-15T19:00:00Z',
      endsAt: '2025-01-15T23:00:00Z',
      ticketUrl: 'https://tickets.com',
      genres: ['Rock'],
      artists: ['Band Name'],
      ageRestriction: '21+',
    }

    const mediumEvent: ScrapedEvent = {
      title: 'Medium',
      startsAt: '2025-01-15',
      sourceUrl: 'url3',
      description: 'Some info',
      coverCharge: '$5',
    }

    // Add a 4th event to ensure sorting actually happens (events.length > limit)
    const lowEvent: ScrapedEvent = {
      title: 'Low',
      startsAt: '2025-01-15',
      sourceUrl: 'url4',
      description: 'Basic',
    }

    const events = [minimalEvent, completeEvent, mediumEvent, lowEvent]
    const sample = getSampleEvents(events, 3)

    // Should return top 3 events by coverage
    expect(sample).toHaveLength(3)
    // The first event should be the most complete one
    expect(sample[0].title).toBe('Complete')
    // Medium should be second (5 fields vs Minimal's 3 and Low's 4)
    expect(sample[1].title).toBe('Medium')
    // Low should be third (4 fields)
    expect(sample[2].title).toBe('Low')
    // Minimal should not be included (only 3 fields, lowest coverage)
    expect(sample.find(e => e.title === 'Minimal')).toBeUndefined()
  })
})
