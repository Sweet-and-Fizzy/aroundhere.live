import { deriveRegionSlug, deriveVenueSlug } from './slug'
import { normalizeRegionName } from './town-key'
import type { PartitionRegion, TownInput } from './types'

export type RegionRef = { existingId: string } | { newIndex: number }

export type PartitionPlanInput = {
  proposal: PartitionRegion[]
  towns: Map<string, TownInput>
  adminTownKeys: Set<string>
  venues: { id: string; slug: string; regionId: string; townKey: string }[]
  venueSlugsByRegion: Map<string, Set<string>>
  takenRegionSlugs: Set<string>
}

export type PartitionPlan = {
  newRegions: { name: string; slug: string }[]
  townUpserts: { townKey: string; city: string; state: string; lat: number; lng: number; region: RegionRef }[]
  venueMoves: { venueId: string; fromRegionId: string; region: RegionRef; newSlug: string | null }[]
}

function refKey(ref: RegionRef): string {
  return 'existingId' in ref ? ref.existingId : `new:${ref.newIndex}`
}

/** Names of proposed NEW regions that collide (normalized) with an existing region name. */
export function findNameCollisions(proposal: PartitionRegion[], existingNames: string[]): string[] {
  const existing = new Set(existingNames.map(normalizeRegionName))
  return proposal
    .filter(r => r.existingRegionId === null && existing.has(normalizeRegionName(r.name)))
    .map(r => r.name)
}

export function planPartitionWrite(input: PartitionPlanInput): PartitionPlan {
  const takenRegionSlugs = new Set(input.takenRegionSlugs)
  const newRegions: PartitionPlan['newRegions'] = []
  const townRef = new Map<string, RegionRef>()

  for (const region of input.proposal) {
    let ref: RegionRef
    if (region.existingRegionId) {
      ref = { existingId: region.existingRegionId }
    } else {
      const slug = deriveRegionSlug(region.name, takenRegionSlugs)
      takenRegionSlugs.add(slug)
      ref = { newIndex: newRegions.length }
      newRegions.push({ name: region.name, slug })
    }
    for (const k of region.townKeys) if (!input.adminTownKeys.has(k)) townRef.set(k, ref)
  }

  const townUpserts: PartitionPlan['townUpserts'] = []
  for (const [townKey, region] of townRef) {
    const town = input.towns.get(townKey)
    if (!town) continue
    townUpserts.push({ townKey, city: town.city, state: town.state, lat: town.lat, lng: town.lng, region })
  }

  const slugsByTarget = new Map<string, Set<string>>()
  const slugsFor = (ref: RegionRef) => {
    const k = refKey(ref)
    if (!slugsByTarget.has(k)) {
      slugsByTarget.set(k, new Set('existingId' in ref ? input.venueSlugsByRegion.get(ref.existingId) ?? [] : []))
    }
    return slugsByTarget.get(k)!
  }

  const venueMoves: PartitionPlan['venueMoves'] = []
  for (const venue of input.venues) {
    const ref = townRef.get(venue.townKey)
    if (!ref) continue
    if ('existingId' in ref && ref.existingId === venue.regionId) continue
    const taken = slugsFor(ref)
    const slug = deriveVenueSlug(venue.slug, taken)
    taken.add(slug)
    venueMoves.push({ venueId: venue.id, fromRegionId: venue.regionId, region: ref, newSlug: slug === venue.slug ? null : slug })
  }

  return { newRegions, townUpserts, venueMoves }
}
