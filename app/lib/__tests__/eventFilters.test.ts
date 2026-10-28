import { describe, it, expect } from 'vitest'
import { CalendarDate } from '@internationalized/date'
import {
  defaultFilterState,
  eventTypesToApi,
  filtersToQuery,
  getDateRange,
  mergeFilterQuery,
  parseFiltersFromQuery,
  parseStoredFilters,
  serializeFilters,
  toApiFilters,
  venuesWithinRadius,
} from '../eventFilters'

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
  it('copies selected venues so later edits to the state do not change requested filters', () => {
    const state = { ...defaultFilterState(), selectedVenueIds: ['a'] }
    const api = toApiFilters(state, { mapFilteredVenueIds: null, favorites: noFavs })
    state.selectedVenueIds.push('b')
    expect(api.venueIds).toEqual(['a'])
  })
  it('sends recommended as myEvents', () => {
    const state = { ...defaultFilterState(), recommended: true, myEvents: 'going' }
    expect(toApiFilters(state, { mapFilteredVenueIds: null, favorites: noFavs }).myEvents).toBe('recommended')
  })
})

describe('parseFiltersFromQuery', () => {
  it('returns null without filter keys', () => expect(parseFiltersFromQuery({ utm_source: 'x' })).toBeNull())
  it('reads venue slugs for later resolution', () => expect(parseFiltersFromQuery({ venues: 'iron-horse,parlor-room' })?.venueSlugs).toEqual(['iron-horse', 'parlor-room']))
  it('accepts legacy venueIds', () => expect(parseFiltersFromQuery({ venueIds: 'a,b' })?.filters.selectedVenueIds).toEqual(['a', 'b']))
  it('accepts legacy eventTypes', () => expect(parseFiltersFromQuery({ eventTypes: 'MUSIC,DJ' })?.filters.selectedEventTypes).toEqual(['MUSIC', 'DJ']))
  it('maps ALL_EVENTS to no selection', () => expect(parseFiltersFromQuery({ types: 'ALL_EVENTS' })?.filters.selectedEventTypes).toEqual([]))
  it('drops unknown event types', () => expect(parseFiltersFromQuery({ types: 'MUSIC,BOGUS' })?.filters.selectedEventTypes).toEqual(['MUSIC']))
  it('reads legacy myEvents=recommended', () => expect(parseFiltersFromQuery({ myEvents: 'recommended' })?.filters).toMatchObject({ recommended: true, myEvents: null }))
  it('reads a custom range', () => {
    const f = parseFiltersFromQuery({ dateStart: '2026-11-02', dateEnd: '2026-11-05' })!.filters
    expect(f.datePreset).toBe('custom')
    expect(f.customDateRange?.start.toString()).toBe('2026-11-02')
  })
  it('ignores an invalid date preset', () => expect(parseFiltersFromQuery({ date: 'someday' })?.filters.datePreset).toBe('all'))
})

describe('parseStoredFilters', () => {
  it('returns null for missing or corrupt data', () => {
    expect(parseStoredFilters(null)).toBeNull()
    expect(parseStoredFilters('{not json')).toBeNull()
    expect(parseStoredFilters('"a string"')).toBeNull()
  })
  it('maps a sidebar-saved ALL_EVENTS to no selection', () => {
    expect(parseStoredFilters(JSON.stringify({ selectedEventTypes: ['ALL_EVENTS'], expandedSection: 'date' }))?.selectedEventTypes).toEqual([])
  })
  it('unwraps legacy label/value objects', () => {
    const raw = JSON.stringify({ selectedGenres: [{ label: 'Jazz', value: 'jazz' }], selectedEventTypes: [{ label: 'DJ', value: 'DJ' }] })
    expect(parseStoredFilters(raw)).toMatchObject({ selectedGenres: ['jazz'], selectedEventTypes: ['DJ'] })
  })
  it('round-trips through serializeFilters', () => {
    const state = { ...defaultFilterState(), searchQuery: 'jazz', datePreset: 'custom', customDateRange: { start: new CalendarDate(2026, 11, 2), end: new CalendarDate(2026, 11, 5) } }
    const parsed = parseStoredFilters(serializeFilters(state))!
    expect(parsed.searchQuery).toBe('jazz')
    expect(parsed.customDateRange?.end.toString()).toBe('2026-11-05')
  })
})

describe('filtersToQuery', () => {
  const venues = [{ id: 'v1', slug: 'iron-horse' }]
  it('writes nothing for defaults', () => expect(filtersToQuery(defaultFilterState(), venues)).toEqual({}))
  it('writes venue slugs and types', () => {
    const state = { ...defaultFilterState(), selectedVenueIds: ['v1'], selectedEventTypes: ['ALL_MUSIC'] }
    expect(filtersToQuery(state, venues)).toEqual({ venues: 'iron-horse', types: 'ALL_MUSIC' })
  })
  it('writes a custom range without date=custom', () => {
    const state = { ...defaultFilterState(), datePreset: 'custom', customDateRange: { start: new CalendarDate(2026, 11, 2), end: new CalendarDate(2026, 11, 5) } }
    expect(filtersToQuery(state, venues)).toEqual({ dateStart: '2026-11-02', dateEnd: '2026-11-05' })
  })
})

describe('mergeFilterQuery', () => {
  it('keeps unrelated params and replaces filter params', () => {
    expect(mergeFilterQuery('?utm_source=mail&venueIds=a&q=old', { q: 'jazz' })).toBe('utm_source=mail&q=jazz')
  })
})

describe('venuesWithinRadius', () => {
  it('keeps venues inside the radius and skips ones without coordinates', () => {
    const venues = [
      { id: 'noho', latitude: 42.3251, longitude: -72.6412 },
      { id: 'boston', latitude: 42.3601, longitude: -71.0589 },
      { id: 'nowhere', latitude: null, longitude: null },
    ]
    expect(venuesWithinRadius(venues, { lat: 42.32, lng: -72.63 }, 10)).toEqual(['noho'])
  })
})
