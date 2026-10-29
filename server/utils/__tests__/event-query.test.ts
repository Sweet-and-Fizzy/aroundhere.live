import { describe, it, expect } from 'vitest'
import { parseEventListQuery, eventFilterConditions, type EventListFilters } from '../event-query'

const NOT_PRIVATE = { OR: [{ eventType: { not: 'PRIVATE' } }, { eventType: null }] }

function filters(overrides: Partial<EventListFilters> = {}): EventListFilters {
  return {
    startDate: new Date('2026-10-28T04:00:00Z'),
    musicOnly: true,
    nonMusicOnly: false,
    ...overrides,
  }
}

describe('parseEventListQuery', () => {
  it('parses dates in the given timezone', () => {
    const parsed = parseEventListQuery({ startDate: '2026-11-01', endDate: '2026-11-02' }, 'America/New_York')
    expect(parsed.startDate.toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(parsed.endDate?.toISOString()).toBe('2026-11-03T04:59:59.999Z')
  })

  it('defaults to music only, and reads lists and flags', () => {
    expect(parseEventListQuery({}, 'America/New_York')).toMatchObject({ musicOnly: true, nonMusicOnly: false })
    const parsed = parseEventListQuery({
      musicOnly: 'false',
      nonMusicOnly: 'true',
      regions: 'pioneer-valley,berkshires',
      venueIds: 'a,b',
      favoriteGenres: 'jazz',
    }, 'America/New_York')
    expect(parsed).toMatchObject({
      musicOnly: false,
      nonMusicOnly: true,
      regions: ['pioneer-valley', 'berkshires'],
      venueIds: ['a', 'b'],
      favoriteGenres: ['jazz'],
    })
  })
})

describe('eventFilterConditions', () => {
  it('limits to music by default and excludes private events', () => {
    const conditions = eventFilterConditions(filters())
    expect(conditions).toContainEqual({ isMusic: true, ...NOT_PRIVATE })
  })

  it('limits to non-music events when asked', () => {
    const conditions = eventFilterConditions(filters({ musicOnly: false, nonMusicOnly: true }))
    expect(conditions).toContainEqual({ isMusic: false, ...NOT_PRIVATE })
  })

  it('shows all classified events when music only is off', () => {
    const conditions = eventFilterConditions(filters({ musicOnly: false }))
    expect(conditions).toContainEqual({ isMusic: { not: null }, ...NOT_PRIVATE })
  })

  it('lets specific event types replace the music filter', () => {
    const conditions = eventFilterConditions(filters({ eventTypes: ['DJ', 'COMEDY'] }))
    expect(conditions).toContainEqual({ eventType: { in: ['DJ', 'COMEDY'] } })
    expect(conditions.some(c => 'isMusic' in c)).toBe(false)
  })

  it('applies regions, venues, genres and cities', () => {
    const conditions = eventFilterConditions(filters({
      regionIds: ['r1'],
      venueIds: ['v1'],
      genres: ['Jazz'],
      cities: ['Northampton'],
    }))
    expect(conditions).toContainEqual({ regionId: { in: ['r1'] } })
    expect(conditions).toContainEqual({ venueId: { in: ['v1'] } })
    expect(conditions).toContainEqual({ canonicalGenres: { hasSome: ['jazz'] } })
    expect(conditions).toContainEqual({ venue: { city: { in: ['Northampton'] } } })
  })

  it('matches any favorite', () => {
    const conditions = eventFilterConditions(filters({ favoriteVenueIds: ['v1'], favoriteGenres: ['Folk'] }))
    expect(conditions).toContainEqual({
      OR: [{ venueId: { in: ['v1'] } }, { canonicalGenres: { hasSome: ['folk'] } }],
    })
  })

  it('leaves out the counted facet', () => {
    const all = filters({
      musicOnly: false,
      nonMusicOnly: true,
      regionIds: ['r1'],
      venueIds: ['v1'],
      genres: ['jazz'],
      cities: ['Northampton'],
    })

    const venue = eventFilterConditions(all, 'venue')
    expect(venue).not.toContainEqual({ venueId: { in: ['v1'] } })
    expect(venue).toContainEqual({ regionId: { in: ['r1'] } })

    expect(eventFilterConditions(all, 'genre')).not.toContainEqual({ canonicalGenres: { hasSome: ['jazz'] } })

    // Type counts cover every classified event, so each type shows what picking it would give
    const type = eventFilterConditions(all, 'type')
    expect(type).toContainEqual({ isMusic: { not: null }, ...NOT_PRIVATE })
    expect(type).not.toContainEqual({ isMusic: false, ...NOT_PRIVATE })

    // Cities and regions share the location picker, so city counts ignore both
    const city = eventFilterConditions(all, 'city')
    expect(city).not.toContainEqual({ venue: { city: { in: ['Northampton'] } } })
    expect(city).not.toContainEqual({ regionId: { in: ['r1'] } })
  })
})
