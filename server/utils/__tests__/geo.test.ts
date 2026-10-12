import { describe, it, expect } from 'vitest'
import { haversineDistance, nearestRegion, selectCandidateRegions } from '../geo'

const northampton = { id: 'pv', name: 'the Pioneer Valley', centroidLat: 42.3251, centroidLng: -72.6412 }
const pittsfield = { id: 'bk', name: 'the Berkshires', centroidLat: 42.4501, centroidLng: -73.2454 }
const boston = { id: 'bos', name: 'Greater Boston', centroidLat: 42.3601, centroidLng: -71.0589 }

describe('haversineDistance', () => {
  it('is zero for the same point', () => {
    expect(haversineDistance(42, -72, 42, -72)).toBe(0)
  })
  it('measures Northampton to Boston at about 82 miles', () => {
    const d = haversineDistance(42.3251, -72.6412, 42.3601, -71.0589)
    expect(d).toBeGreaterThan(78)
    expect(d).toBeLessThan(86)
  })
})

describe('nearestRegion', () => {
  it('returns null for no regions', () => {
    expect(nearestRegion([], 42, -72)).toBeNull()
  })
  it('picks the closest centroid', () => {
    const result = nearestRegion([pittsfield, boston, northampton], 42.27, -72.67) // Easthampton
    expect(result?.region.id).toBe('pv')
  })
})

describe('selectCandidateRegions', () => {
  it('keeps only regions within maxMiles, nearest first', () => {
    const result = selectCandidateRegions([boston, pittsfield, northampton], 42.27, -72.67, { maxMiles: 60 })
    expect(result.map(r => r.id)).toEqual(['pv', 'bk'])
    expect(result[0]!.distanceMiles).toBeLessThan(result[1]!.distanceMiles)
  })
  it('caps the list at limit', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...northampton, id: `r${i}`, centroidLat: 42.3 + i * 0.01 }))
    expect(selectCandidateRegions(many, 42.3, -72.64, { limit: 5 })).toHaveLength(5)
  })
})
