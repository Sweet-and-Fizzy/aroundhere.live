import { describe, it, expect } from 'vitest'
import { evaluateVenueData, evaluateEventData } from '../evaluator'
import type { VenueInfo } from '../types'

// Helper to create future dates for testing
function futureDate(daysFromNow: number = 30): Date {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  return date
}

function futureISOString(daysFromNow: number = 30): string {
  return futureDate(daysFromNow).toISOString()
}

describe('evaluateVenueData', () => {
  describe('with complete venue data', () => {
    it('should return perfect score for fully populated venue', () => {
      const venue: VenueInfo = {
        name: 'The Iron Horse Music Hall',
        website: 'https://www.iheg.com',
        address: '20 Center St',
        city: 'Northampton',
        state: 'MA',
        postalCode: '01060',
        phone: '(413) 584-0610',
        description: 'Legendary music venue',
        venueType: 'CONCERT_HALL',
        capacity: 200,
        logoUrl: 'https://venue.com/logo.png',
        imageUrl: 'https://venue.com/image.jpg',
      }

      const result = evaluateVenueData(venue)

      expect(result.isAcceptable).toBe(true)
      expect(result.requiredFieldsMissing).toEqual([])
      expect(result.completenessScore).toBe(1) // All fields present
      expect(result.feedback).toContain('All required fields found')
    })

    it('should accept venue with only required fields', () => {
      const venue: VenueInfo = {
        name: 'Test Venue',
        website: 'https://test.com',
        address: '123 Main St',
        city: 'Boston',
        state: 'MA',
      }

      const result = evaluateVenueData(venue)

      expect(result.isAcceptable).toBe(true)
      expect(result.requiredFieldsMissing).toEqual([])
      expect(result.fieldsFound).toEqual(['name', 'website', 'address', 'city', 'state'])
      expect(result.feedback).toContain('All required fields found')
    })
  })

  describe('with missing required fields', () => {
    it('should reject venue missing name', () => {
      const venue: VenueInfo = {
        website: 'https://test.com',
        address: '123 Main St',
        city: 'Boston',
        state: 'MA',
      }

      const result = evaluateVenueData(venue)

      expect(result.isAcceptable).toBe(false)
      expect(result.requiredFieldsMissing).toContain('name')
      expect(result.feedback).toContain('Missing required fields: name')
    })

    it('should reject venue missing multiple required fields', () => {
      const venue: VenueInfo = {
        name: 'Test Venue',
        // Missing website, address, city, state
      }

      const result = evaluateVenueData(venue)

      expect(result.isAcceptable).toBe(false)
      expect(result.requiredFieldsMissing).toContain('website')
      expect(result.requiredFieldsMissing).toContain('address')
      expect(result.requiredFieldsMissing).toContain('city')
      expect(result.requiredFieldsMissing).toContain('state')
    })

    it('should not count empty strings as valid', () => {
      const venue: VenueInfo = {
        name: '   ', // Whitespace only
        website: '',
        address: '123 Main St',
        city: 'Boston',
        state: 'MA',
      }

      const result = evaluateVenueData(venue)

      expect(result.isAcceptable).toBe(false)
      expect(result.requiredFieldsMissing).toContain('name')
      expect(result.requiredFieldsMissing).toContain('website')
    })
  })

  describe('with null or undefined input', () => {
    it('should handle null venue data', () => {
      const result = evaluateVenueData(null)

      expect(result.isAcceptable).toBe(false)
      expect(result.completenessScore).toBe(0)
      expect(result.feedback).toContain('No venue data was extracted')
    })

    it('should handle undefined venue data', () => {
      const result = evaluateVenueData(undefined)

      expect(result.isAcceptable).toBe(false)
      expect(result.completenessScore).toBe(0)
    })
  })

  describe('completeness scoring', () => {
    it('should calculate correct score for partial data', () => {
      const venue: VenueInfo = {
        name: 'Test Venue',
        website: 'https://test.com',
        address: '123 Main St',
        city: 'Boston',
        state: 'MA',
        phone: '555-1234',
        // 6 out of 12 total fields (5 required + 1 optional)
      }

      const result = evaluateVenueData(venue)

      expect(result.completenessScore).toBe(6 / 12) // 50%
    })
  })

  describe('feedback messages', () => {
    it('should suggest missing optional fields when acceptable', () => {
      const venue: VenueInfo = {
        name: 'Test Venue',
        website: 'https://test.com',
        address: '123 Main St',
        city: 'Boston',
        state: 'MA',
      }

      const result = evaluateVenueData(venue)

      expect(result.isAcceptable).toBe(true)
      expect(result.feedback).toContain('Consider extracting these additional fields')
    })
  })
})

describe('evaluateEventData', () => {
  describe('with complete event data', () => {
    it('should accept fully populated events', () => {
      const events = [
        {
          title: 'Live Jazz Night',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          description: 'Great show',
          coverCharge: '10',
          imageUrl: 'https://venue.com/image.jpg',
          doorsAt: futureDate(30),
          endsAt: futureDate(30),
          ticketUrl: 'https://tickets.com',
          genres: ['Jazz', 'Blues'],
          artists: ['Band Name'],
          ageRestriction: '21+',
        },
      ]

      const result = evaluateEventData(events)

      // Debug: log the result if test fails
      if (!result.isAcceptable) {
        console.log('Fields found:', result.fieldsFound)
        console.log('Fields missing:', result.fieldsMissing)
        console.log('Feedback:', result.feedback)
      }

      expect(result.isAcceptable).toBe(true)
      expect(result.requiredFieldsMissing).toEqual([])
      expect(result.feedback).toContain('Successfully extracted 1 events')
    })

    it('should accept events with ISO date strings', () => {
      const events = [
        {
          title: 'Concert',
          startsAt: futureISOString(30),
          sourceUrl: 'https://venue.com/events/1',
          description: 'Test event',
          coverCharge: '15',
          imageUrl: 'https://image.com',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.fieldsFound).toContain('startsAt')
      expect(result.isAcceptable).toBe(true)
    })
  })

  describe('with missing required fields', () => {
    it('should reject events missing title', () => {
      const events = [
        {
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.isAcceptable).toBe(false)
      expect(result.requiredFieldsMissing).toContain('title')
    })

    it('should reject events missing startsAt', () => {
      const events = [
        {
          title: 'Concert',
          sourceUrl: 'https://venue.com/events/1',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.isAcceptable).toBe(false)
      expect(result.requiredFieldsMissing).toContain('startsAt')
    })

    it('should reject events missing sourceUrl', () => {
      const events = [
        {
          title: 'Concert',
          startsAt: futureDate(30),
        },
      ]

      const result = evaluateEventData(events)

      expect(result.isAcceptable).toBe(false)
      expect(result.requiredFieldsMissing).toContain('sourceUrl')
    })
  })

  describe('with no events', () => {
    it('should handle null input', () => {
      const result = evaluateEventData(null)

      expect(result.isAcceptable).toBe(false)
      expect(result.completenessScore).toBe(0)
      expect(result.feedback).toContain('No events were extracted')
    })

    it('should handle undefined input', () => {
      const result = evaluateEventData(undefined)

      expect(result.isAcceptable).toBe(false)
      expect(result.completenessScore).toBe(0)
    })

    it('should handle empty array', () => {
      const result = evaluateEventData([])

      expect(result.isAcceptable).toBe(false)
      expect(result.completenessScore).toBe(0)
      expect(result.feedback).toContain('No events were extracted')
    })
  })

  describe('data quality detection', () => {
    it('should detect time in title', () => {
      const events = [
        {
          title: 'Live Music 7:30pm',
          startsAt: new Date('2025-03-15T19:30:00Z'),
          sourceUrl: 'https://venue.com/events/1',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.feedback).toContain('contains time pattern')
      expect(result.feedback).toContain('7:30pm')
    })

    it('should detect multiple time formats in title', () => {
      const testCases = [
        'Concert at 7pm',
        'Show 7:30 PM',
        'Music 19:30',
        'Doors @ 7',
        'Show: 8pm',
      ]

      for (const title of testCases) {
        const events = [
          {
            title,
            startsAt: futureDate(30),
            sourceUrl: 'https://venue.com/events/1',
          },
        ]

        const result = evaluateEventData(events)
        expect(result.feedback).toContain('contains time pattern')
      }
    })

    it('should detect date in title', () => {
      const events = [
        {
          title: 'Concert March 15',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.feedback).toContain('contains date pattern')
      expect(result.feedback).toContain('March 15')
    })

    it('should detect past dates', () => {
      const pastDate = new Date('2020-01-01T20:00:00Z')
      const events = [
        {
          title: 'Old Concert',
          startsAt: pastDate,
          sourceUrl: 'https://venue.com/events/1',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.feedback).toContain('is in the past')
    })

    it('should detect far future dates', () => {
      const farFuture = new Date()
      farFuture.setFullYear(farFuture.getFullYear() + 2)

      const events = [
        {
          title: 'Future Concert',
          startsAt: farFuture,
          sourceUrl: 'https://venue.com/events/1',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.feedback).toContain('more than a year away')
    })

    it('should detect invalid coverCharge values', () => {
      const events = [
        {
          title: 'Concert',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          coverCharge: 'not a number',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.feedback).toContain('not a valid number')
    })

    it('should detect unrealistic coverCharge values', () => {
      const events = [
        {
          title: 'Concert',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          coverCharge: '1000',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.feedback).toContain('unrealistic')
    })

    it('should reject events with time in title even if fields complete', () => {
      const events = [
        {
          title: 'Concert 7:30pm',
          startsAt: new Date('2025-03-15T19:30:00Z'),
          sourceUrl: 'https://venue.com/events/1',
          description: 'Great show',
          coverCharge: '$10',
          imageUrl: 'https://venue.com/image.jpg',
          genres: ['Rock'],
        },
      ]

      const result = evaluateEventData(events)

      expect(result.isAcceptable).toBe(false) // Quality issues prevent acceptance
      expect(result.feedback).toContain('contains time pattern')
    })
  })

  describe('field coverage threshold', () => {
    it('should require fields present in at least 50% of sample events', () => {
      const events = [
        {
          title: 'Event 1',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          description: 'Has description',
        },
        {
          title: 'Event 2',
          startsAt: futureDate(31),
          sourceUrl: 'https://venue.com/events/2',
          // No description
        },
      ]

      const result = evaluateEventData(events)

      // Description appears in 1/2 events = 50%, should be counted
      expect(result.fieldsFound).toContain('description')
    })

    it('should not count fields present in less than 50% of events', () => {
      const events = [
        {
          title: 'Event 1',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          imageUrl: 'https://image.com',
        },
        {
          title: 'Event 2',
          startsAt: futureDate(31),
          sourceUrl: 'https://venue.com/events/2',
        },
        {
          title: 'Event 3',
          startsAt: futureDate(32),
          sourceUrl: 'https://venue.com/events/3',
        },
      ]

      const result = evaluateEventData(events)

      // imageUrl appears in 1/3 events = 33%, should not be counted
      expect(result.fieldsFound).not.toContain('imageUrl')
      expect(result.fieldsMissing).toContain('imageUrl')
    })
  })

  describe('optional field requirements', () => {
    it('should reject if less than 30% of optional fields present', () => {
      const events = [
        {
          title: 'Concert',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          // No optional fields (0% of 9 optional fields)
        },
      ]

      const result = evaluateEventData(events)

      expect(result.isAcceptable).toBe(false)
      expect(result.feedback).toContain('Low coverage of optional fields')
    })

    it('should accept if at least 30% of optional fields present', () => {
      const events = [
        {
          title: 'Concert',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          description: 'Great show',
          coverCharge: '10',
          imageUrl: 'https://image.com',
          // 3 optional fields out of 9 = 33%
        },
      ]

      const result = evaluateEventData(events)

      expect(result.isAcceptable).toBe(true)
    })
  })

  describe('sample size handling', () => {
    it('should analyze up to 3 events for field coverage', () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        title: `Event ${i + 1}`,
        startsAt: futureDate(30),
        sourceUrl: `https://venue.com/events/${i + 1}`,
      }))

      const result = evaluateEventData(events)

      expect(result.feedback).toContain('Found 10 events')
      // Should still analyze consistency across first 3 events
    })
  })

  describe('array field handling', () => {
    it('should count non-empty arrays as present', () => {
      const events = [
        {
          title: 'Concert',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          genres: ['Rock', 'Blues'],
          artists: ['Band Name'],
        },
      ]

      const result = evaluateEventData(events)

      expect(result.fieldsFound).toContain('genres')
      expect(result.fieldsFound).toContain('artists')
    })

    it('should not count empty arrays as present', () => {
      const events = [
        {
          title: 'Concert',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          genres: [],
          artists: [],
        },
      ]

      const result = evaluateEventData(events)

      expect(result.fieldsFound).not.toContain('genres')
      expect(result.fieldsFound).not.toContain('artists')
    })
  })

  describe('feedback formatting', () => {
    it('should include sample data in feedback', () => {
      const events = [
        {
          title: 'Concert',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
        },
      ]

      const result = evaluateEventData(events)

      expect(result.feedback).toContain('Sample of extracted data')
      expect(result.feedback).toContain('Event 1')
    })

    it('should truncate long description values in sample', () => {
      const longDescription = 'A'.repeat(100)
      const events = [
        {
          title: 'Concert',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
          description: longDescription,
        },
      ]

      const result = evaluateEventData(events)

      expect(result.feedback).toContain('...')
    })

    it('should deduplicate quality issues in feedback', () => {
      const events = [
        {
          title: 'Concert 7pm',
          startsAt: futureDate(30),
          sourceUrl: 'https://venue.com/events/1',
        },
        {
          title: 'Show 8pm',
          startsAt: futureDate(31),
          sourceUrl: 'https://venue.com/events/2',
        },
      ]

      const result = evaluateEventData(events)

      // Should only show time pattern issue once, not twice
      const timeIssueCount = (result.feedback.match(/contains time pattern/g) || []).length
      expect(timeIssueCount).toBe(1)
    })
  })
})
