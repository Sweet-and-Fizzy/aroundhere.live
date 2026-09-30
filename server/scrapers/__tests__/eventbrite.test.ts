import { describe, expect, it } from 'vitest'
import {
  extractEmbeddedUpcomingEvents,
  findEventLd,
  formatOffersPrice,
  parseAgeRestrictionFromText,
} from '../platforms/eventbrite'

describe('findEventLd', () => {
  it('finds a top-level Event block', () => {
    const blocks = [
      { '@type': 'WebPage', name: 'ignore' },
      { '@type': 'Event', name: 'Show', startDate: '2026-08-18T19:00:00-04:00' },
    ]
    expect(findEventLd(blocks)?.name).toBe('Show')
  })

  it('finds an Event inside an array block and matches subtypes', () => {
    const blocks = [[{ '@type': 'MusicEvent', name: 'Gig' }]]
    expect(findEventLd(blocks)?.name).toBe('Gig')
  })

  it('finds an Event nested in @graph', () => {
    const blocks = [{ '@graph': [{ '@type': 'WebPage' }, { '@type': 'Event', name: 'Play' }] }]
    expect(findEventLd(blocks)?.name).toBe('Play')
  })

  it('returns null when no Event exists', () => {
    expect(findEventLd([{ '@type': 'WebPage' }])).toBeNull()
  })
})

describe('formatOffersPrice', () => {
  it('formats a single price', () => {
    expect(formatOffersPrice({ price: '26.38' })).toBe('$26.38')
  })

  it('formats a range from lowPrice/highPrice', () => {
    expect(formatOffersPrice([{ lowPrice: 10, highPrice: 25 }])).toBe('$10-$25')
  })

  it('returns Free when all prices are zero', () => {
    expect(formatOffersPrice({ price: 0 })).toBe('Free')
  })

  it('returns undefined for missing offers', () => {
    expect(formatOffersPrice(undefined)).toBeUndefined()
  })
})

describe('parseAgeRestrictionFromText', () => {
  it('detects 21+', () => {
    expect(parseAgeRestrictionFromText('This event is 21+ only')).toBe('TWENTY_ONE_PLUS')
  })

  it('detects 18 and over', () => {
    expect(parseAgeRestrictionFromText('18 and over welcome')).toBe('EIGHTEEN_PLUS')
  })

  it('detects all ages', () => {
    expect(parseAgeRestrictionFromText('All ages show')).toBe('ALL_AGES')
  })

  it('returns undefined when nothing matches', () => {
    expect(parseAgeRestrictionFromText('Doors at 7')).toBeUndefined()
  })
})

describe('extractEmbeddedUpcomingEvents', () => {
  const page = (data: unknown) =>
    `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`

  it('reads upcomingEvents from the organizer page Next data', () => {
    const html = page({
      props: {
        pageProps: {
          upcomingEvents: [
            {
              id: '1997162567000',
              name: 'Community Day',
              url: 'https://www.eventbrite.com/e/community-day-tickets-1997162567000',
              summary: '',
            },
            { id: 'no-url', name: 'Broken' },
          ],
        },
      },
    })
    expect(extractEmbeddedUpcomingEvents(html)).toEqual([
      {
        id: '1997162567000',
        url: 'https://www.eventbrite.com/e/community-day-tickets-1997162567000',
        title: 'Community Day',
        summary: '',
      },
    ])
  })

  it('returns an empty list when the organizer has no upcoming events', () => {
    expect(extractEmbeddedUpcomingEvents(page({ props: { upcomingEvents: [] } }))).toEqual([])
  })

  it('returns null when the page has no Next data', () => {
    expect(extractEmbeddedUpcomingEvents('<html><body>Just a moment...</body></html>')).toBeNull()
  })

  it('returns null when the embedded list is truncated, so missing events are not canceled', () => {
    const html = page({
      props: {
        upcomingEvents: [{ id: '1', url: 'https://www.eventbrite.com/e/one-1', name: 'One' }],
        upcomingEventsTotal: 25,
      },
    })
    expect(extractEmbeddedUpcomingEvents(html)).toBeNull()
  })

  it('accepts numeric event ids', () => {
    const html = page({
      props: {
        upcomingEvents: [{ id: 42, url: 'https://www.eventbrite.com/e/two-42', name: 'Two' }],
        upcomingEventsTotal: 1,
      },
    })
    expect(extractEmbeddedUpcomingEvents(html)?.[0]?.id).toBe('42')
  })

  it('returns null when the Next data has no upcomingEvents', () => {
    expect(extractEmbeddedUpcomingEvents(page({ props: { pageProps: {} } }))).toBeNull()
  })
})
