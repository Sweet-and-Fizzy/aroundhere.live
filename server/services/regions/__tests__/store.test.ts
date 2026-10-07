import { describe, it, expect } from 'vitest'
import { chooseCentroid } from '../store'

describe('chooseCentroid', () => {
  const venue = { lat: 1, lng: 2 }
  const town = { lat: 3, lng: 4 }
  const current = { lat: 5, lng: 6 }
  it('prefers the venue average', () => {
    expect(chooseCentroid(venue, town, current)).toEqual(venue)
  })
  it('falls back to the town average when there are no venue coordinates', () => {
    expect(chooseCentroid(null, town, current)).toEqual(town)
  })
  it('keeps the current centroid when neither average exists', () => {
    expect(chooseCentroid(null, null, current)).toEqual(current)
    expect(chooseCentroid(null, null, null)).toBeNull()
  })
})
