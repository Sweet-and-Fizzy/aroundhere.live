import { describe, it, expect } from 'vitest'
import { eventLocationName, eventLocationCity } from '../eventLocation'

describe('eventLocationName', () => {
  it('prefers the venue name', () => {
    expect(eventLocationName({ venue: { name: 'Iron Horse' }, locationName: 'Somewhere' })).toBe('Iron Horse')
  })

  it('falls back to the submitted location name', () => {
    expect(eventLocationName({ venue: null, locationName: 'Town Common' })).toBe('Town Common')
  })

  it('returns null when neither is set', () => {
    expect(eventLocationName({ venue: null, locationName: null })).toBeNull()
  })
})

describe('eventLocationCity', () => {
  it('prefers the venue city', () => {
    expect(eventLocationCity({ venue: { name: 'Iron Horse', city: 'Northampton' }, locationCity: 'Amherst' })).toBe('Northampton')
  })

  it('falls back to the submitted location city', () => {
    expect(eventLocationCity({ venue: null, locationCity: 'Amherst' })).toBe('Amherst')
  })

  it('returns null when neither is set', () => {
    expect(eventLocationCity({})).toBeNull()
  })
})
