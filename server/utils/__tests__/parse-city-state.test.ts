import { describe, it, expect } from 'vitest'
import { parseCityState } from '../parse-city-state'

describe('parseCityState', () => {
  it('strips country and ZIP from a Google formatted address', () => {
    expect(parseCityState('X, Florence, MA 01062, USA')).toEqual({ city: 'Florence', state: 'MA' })
    expect(parseCityState('1 Main St, Boston, MA 02101, United States')).toEqual({ city: 'Boston', state: 'MA' })
  })
  it('parses a simple city, state', () => {
    expect(parseCityState('Northampton, MA')).toEqual({ city: 'Northampton', state: 'MA' })
  })
  it('parses a street address with ZIP and no country', () => {
    expect(parseCityState('123 Main St, Amherst, MA 01002')).toEqual({ city: 'Amherst', state: 'MA' })
  })
  it('returns nulls for garbage', () => {
    expect(parseCityState('somewhere')).toEqual({ city: null, state: null })
    expect(parseCityState('')).toEqual({ city: null, state: null })
    expect(parseCityState('Florence, USA')).toEqual({ city: null, state: null })
  })
})
