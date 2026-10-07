import { describe, it, expect } from 'vitest'
import { normalizeTownKey, normalizeRegionName, cleanRegionName } from '../town-key'

describe('normalizeTownKey', () => {
  it.each([
    ['Northampton', 'MA', 'northampton|ma'],
    ['  Turners   Falls ', 'ma', 'turners falls|ma'],
    ['Northampton, MA', 'MA', 'northampton|ma'],
    ['Northampton MA', 'MA', 'northampton|ma'],
    ['Boston, Massachusetts', 'Massachusetts', 'boston|ma'],
    ['Brattleboro', 'Vermont', 'brattleboro|vt'],
    ['St. Johnsbury', 'VT', 'st. johnsbury|vt'],
    ['Montréal', 'QC', 'montréal|qc'],
  ])('%s, %s -> %s', (city, state, expected) => {
    expect(normalizeTownKey(city, state)).toBe(expected)
  })

  it('leaves a suffix that does not match the state', () => {
    expect(normalizeTownKey('Kansas City MO', 'KS')).toBe('kansas city mo|ks')
  })

  it.each([
    [null, 'MA'], ['Boston', null], ['', 'MA'], ['Boston', 'Narnia'],
  ])('returns null for %s, %s', (city, state) => {
    expect(normalizeTownKey(city, state)).toBeNull()
  })
})

describe('region names', () => {
  it('compares names regardless of in/the/case/spacing', () => {
    expect(normalizeRegionName('in the  Berkshires')).toBe(normalizeRegionName('The Berkshires'))
    expect(normalizeRegionName('North Shore')).toBe(normalizeRegionName('the North Shore'))
  })
  it('cleans a leading "in" for display but keeps "the"', () => {
    expect(cleanRegionName(' in the  Berkshires ')).toBe('the Berkshires')
    expect(cleanRegionName('Western Massachusetts')).toBe('Western Massachusetts')
  })
})
