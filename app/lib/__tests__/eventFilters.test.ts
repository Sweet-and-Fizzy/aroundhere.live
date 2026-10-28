import { describe, it, expect } from 'vitest'
import { CalendarDate } from '@internationalized/date'
import { defaultFilterState, eventTypesToApi, getDateRange, toApiFilters } from '../eventFilters'

describe('eventTypesToApi', () => {
  it('treats no selection as all events', () => expect(eventTypesToApi([])).toEqual({ musicOnly: false }))
  it('uses only musicOnly for all music', () => expect(eventTypesToApi(['ALL_MUSIC'])).toEqual({ musicOnly: true }))
  it('uses nonMusicOnly for other events', () => expect(eventTypesToApi(['OTHER_EVENTS'])).toEqual({ nonMusicOnly: true }))
  it('treats both groups as all events', () => expect(eventTypesToApi(['ALL_MUSIC', 'OTHER_EVENTS'])).toEqual({ musicOnly: false }))
  it('expands a group mixed with a specific type', () => {
    expect(eventTypesToApi(['ALL_MUSIC', 'COMEDY'])).toEqual({ eventTypes: ['MUSIC', 'DJ', 'OPEN_MIC', 'KARAOKE', 'COMEDY'], musicOnly: false })
  })
  it('passes specific types through', () => expect(eventTypesToApi(['DJ'])).toEqual({ eventTypes: ['DJ'], musicOnly: false }))
})

describe('getDateRange', () => {
  const wed = new Date(2026, 9, 28, 15) // Wednesday
  it('today', () => expect(getDateRange('today', null, wed)).toEqual({ startDate: '2026-10-28', endDate: '2026-10-28' }))
  it('weekend from a weekday', () => expect(getDateRange('weekend', null, wed)).toEqual({ startDate: '2026-10-30', endDate: '2026-11-01' }))
  it('weekend on a Saturday starts today', () => expect(getDateRange('weekend', null, new Date(2026, 9, 31, 12))).toEqual({ startDate: '2026-10-31', endDate: '2026-11-01' }))
  it('week', () => expect(getDateRange('week', null, wed)).toEqual({ startDate: '2026-10-28', endDate: '2026-11-04' }))
  it('all has no end', () => expect(getDateRange('all', null, wed)).toEqual({ startDate: '2026-10-28', endDate: undefined }))
  it('custom is inclusive', () => {
    const range = { start: new CalendarDate(2026, 11, 2), end: new CalendarDate(2026, 11, 5) }
    expect(getDateRange('custom', range, wed)).toEqual({ startDate: '2026-11-02', endDate: '2026-11-05' })
  })
})

describe('toApiFilters', () => {
  const noFavs = { artists: [], venues: [], genres: [] }
  it('defaults to all upcoming events', () => {
    expect(toApiFilters(defaultFilterState(), { mapFilteredVenueIds: null, favorites: noFavs }))
      .toMatchObject({ musicOnly: false, venueIds: undefined, q: undefined })
  })
  it('intersects selected venues with the map filter', () => {
    const state = { ...defaultFilterState(), selectedVenueIds: ['a', 'b'] }
    expect(toApiFilters(state, { mapFilteredVenueIds: ['b', 'c'], favorites: noFavs }).venueIds).toEqual(['b'])
  })
  it('sends recommended as myEvents', () => {
    const state = { ...defaultFilterState(), recommended: true, myEvents: 'going' }
    expect(toApiFilters(state, { mapFilteredVenueIds: null, favorites: noFavs }).myEvents).toBe('recommended')
  })
})
