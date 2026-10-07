import { describe, it, expect } from 'vitest'
import { normalizeTownKey, normalizeStateCode, normalizeRegionName, cleanRegionName, cleanTownCity } from '../town-key'

describe('normalizeStateCode', () => {
  it('accepts 2-letter codes', () => {
    expect(normalizeStateCode('MA')).toBe('ma')
    expect(normalizeStateCode('vt')).toBe('vt')
  })
  it('accepts full state names', () => {
    expect(normalizeStateCode('Massachusetts')).toBe('ma')
    expect(normalizeStateCode('vermont')).toBe('vt')
  })
  it('accepts common abbreviations', () => {
    expect(normalizeStateCode('mass')).toBe('ma')
    expect(normalizeStateCode('Mass.')).toBe('ma')
    expect(normalizeStateCode('conn')).toBe('ct')
    expect(normalizeStateCode('vt.')).toBe('vt')
    expect(normalizeStateCode('n.y.')).toBe('ny')
    expect(normalizeStateCode('d.c.')).toBe('dc')
  })
  it('strips periods before 2-letter test', () => {
    expect(normalizeStateCode('M.A.')).toBe('ma')
  })
  it('rejects invalid codes', () => {
    expect(normalizeStateCode('ZZ')).toBeNull()
    expect(normalizeStateCode('Narnia')).toBeNull()
  })
})

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

  it('strips state suffix when it follows a comma with no space', () => {
    expect(normalizeTownKey('Northampton,MA', 'MA')).toBe('northampton|ma')
  })

  it('strips trailing ZIP codes and periods before suffix matching', () => {
    expect(normalizeTownKey('Northampton, MA 01060', 'MA')).toBe('northampton|ma')
    expect(normalizeTownKey('Northampton, MA.', 'MA')).toBe('northampton|ma')
    expect(normalizeTownKey('Northampton 01060-1234', 'MA')).toBe('northampton|ma')
  })

  it('strips Mass. as a state suffix', () => {
    expect(normalizeTownKey('Northampton, Mass.', 'MA')).toBe('northampton|ma')
  })

  it('strips state name only when preceded by comma', () => {
    expect(normalizeTownKey('Port Washington', 'WA')).toBe('port washington|wa')
  })

  it.each([
    [null, 'MA'], ['Boston', null], ['', 'MA'], ['Boston', 'Narnia'],
  ])('returns null for %s, %s', (city, state) => {
    expect(normalizeTownKey(city, state)).toBeNull()
  })

  // Property test: normalizeTownKey should equal cleanTownCity lowercased + |stateCode
  it.each([
    ['Northampton', 'MA'],
    ['  Turners   Falls ', 'ma'],
    ['Northampton, MA', 'MA'],
    ['Northampton MA', 'MA'],
    ['Boston, Massachusetts', 'Massachusetts'],
    ['Brattleboro', 'Vermont'],
    ['St. Johnsbury', 'VT'],
    ['Montréal', 'QC'],
  ])('cleanTownCity relationship for %s, %s', (city, state) => {
    const cleaned = cleanTownCity(city, state)
    const stateCode = normalizeStateCode(state)
    if (cleaned && stateCode) {
      expect(normalizeTownKey(city, state)).toBe(`${cleaned.toLowerCase()}|${stateCode}`)
    }
  })
})

describe('cleanTownCity', () => {
  it.each([
    ['Northampton', 'MA', 'Northampton'],
    ['  Turners   Falls ', 'ma', 'Turners Falls'],
    ['Northampton, MA', 'MA', 'Northampton'],
    ['Amherst 01002', 'MA', 'Amherst'],
    ['Montréal', 'QC', 'Montréal'],
  ])('%s, %s -> %s', (city, state, expected) => {
    expect(cleanTownCity(city, state)).toBe(expected)
  })

  it.each([
    [null, 'MA'],
    ['Boston', null],
    ['', 'MA'],
    ['Boston', 'Narnia'],
  ])('returns null for %s, %s', (city, state) => {
    expect(cleanTownCity(city, state)).toBeNull()
  })

  it('preserves accents and casing', () => {
    expect(cleanTownCity('Montréal', 'QC')).toBe('Montréal')
    expect(cleanTownCity('BOSTON', 'MA')).toBe('BOSTON')
  })

  it('collapses internal whitespace', () => {
    expect(cleanTownCity('  Turners   Falls  ', 'MA')).toBe('Turners Falls')
  })

  it('strips state suffix regardless of case', () => {
    expect(cleanTownCity('Northampton, MA', 'MA')).toBe('Northampton')
    expect(cleanTownCity('Northampton, ma', 'MA')).toBe('Northampton')
    expect(cleanTownCity('Boston, MASSACHUSETTS', 'MA')).toBe('Boston')
  })

  it('strips trailing ZIP codes', () => {
    expect(cleanTownCity('Northampton 01060', 'MA')).toBe('Northampton')
    expect(cleanTownCity('Northampton 01060-1234', 'MA')).toBe('Northampton')
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
