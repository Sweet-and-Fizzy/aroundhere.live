import { describe, it, expect } from 'vitest'
import { deriveRegionSlug, deriveVenueSlug } from '../slug'

describe('deriveRegionSlug', () => {
  it('strips in/the and punctuation', () => {
    expect(deriveRegionSlug('the North Shore', new Set())).toBe('north-shore')
    expect(deriveRegionSlug("in the Martha's Vineyard", new Set())).toBe('marthas-vineyard')
  })
  it('suffixes on collision, -2 then -3', () => {
    expect(deriveRegionSlug('the Berkshires', new Set(['berkshires']))).toBe('berkshires-2')
    expect(deriveRegionSlug('Berkshires', new Set(['berkshires', 'berkshires-2']))).toBe('berkshires-3')
  })
})

describe('deriveVenueSlug', () => {
  it('returns the base slug when free', () => {
    expect(deriveVenueSlug('the-hangar', new Set())).toBe('the-hangar')
  })
  it('suffixes when taken', () => {
    expect(deriveVenueSlug('the-hangar', new Set(['the-hangar', 'the-hangar-2']))).toBe('the-hangar-3')
  })
})
