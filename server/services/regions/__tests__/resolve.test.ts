import { describe, it, expect } from 'vitest'
import { resolveRegionForVenue } from '../resolve'
import type { RegionStore } from '../store'
import type { RegionSummary } from '../types'

const pv: RegionSummary = { id: 'pv', name: 'the Pioneer Valley', centroidLat: 42.3251, centroidLng: -72.6412, towns: [] }

function fakeStore(regions: RegionSummary[]): RegionStore {
  return {
    listRegionsWithCentroids: async () => regions,
    getHoldingRegionId: async () => 'holding',
  }
}

describe('resolveRegionForVenue (interim)', () => {
  it('uses the nearest region within 25 miles', async () => {
    const r = await resolveRegionForVenue({ store: fakeStore([pv]) }, { latitude: 42.27, longitude: -72.67 })
    expect(r).toEqual({ regionId: 'pv', via: 'nearest' })
  })
  it('sends a far venue to the holding region', async () => {
    const r = await resolveRegionForVenue({ store: fakeStore([pv]) }, { latitude: 42.36, longitude: -71.06 }) // Boston
    expect(r).toEqual({ regionId: 'holding', via: 'holding' })
  })
  it('sends a venue without coordinates to the holding region', async () => {
    const r = await resolveRegionForVenue({ store: fakeStore([pv]) }, { city: 'Northampton', state: 'MA' })
    expect(r).toEqual({ regionId: 'holding', via: 'holding' })
  })
  it('uses the holding region when no regions exist', async () => {
    const r = await resolveRegionForVenue({ store: fakeStore([]) }, { latitude: 42.27, longitude: -72.67 })
    expect(r.via).toBe('holding')
  })
})
