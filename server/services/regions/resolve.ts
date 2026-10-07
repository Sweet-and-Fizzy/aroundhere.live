import { selectCandidateRegions } from '../../utils/geo'
import type { RegionStore } from './store'
import type { ResolveResult, VenueLocation } from './types'

export type ResolveDeps = { store: RegionStore }

const INTERIM_MAX_MILES = 25

/**
 * Pick the region for a new venue. Never misfiles: anything that does not
 * clearly belong to an existing region goes to the holding region.
 */
export async function resolveRegionForVenue(deps: ResolveDeps, venue: VenueLocation): Promise<ResolveResult> {
  const { store } = deps
  if (venue.latitude != null && venue.longitude != null) {
    const regions = await store.listRegionsWithCentroids()
    const [nearest] = selectCandidateRegions(regions, venue.latitude, venue.longitude, { maxMiles: INTERIM_MAX_MILES, limit: 1 })
    if (nearest) return { regionId: nearest.id, via: 'nearest' }
  }
  return { regionId: await store.getHoldingRegionId(), via: 'holding' }
}
