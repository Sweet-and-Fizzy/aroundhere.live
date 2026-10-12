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
    .filter(r => !r.existingRegionId && existing.has(normalizeRegionName(r.name)))
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
    if (!ref || !input.towns.has(venue.townKey)) continue
    if ('existingId' in ref && ref.existingId === venue.regionId) continue
    const taken = slugsFor(ref)
    const slug = deriveVenueSlug(venue.slug, taken)
    taken.add(slug)
    venueMoves.push({ venueId: venue.id, fromRegionId: venue.regionId, region: ref, newSlug: slug === venue.slug ? null : slug })
  }

  return { newRegions, townUpserts, venueMoves }
}

export type CheckProposalInput = {
  regions: PartitionRegion[]
  towns: TownInput[]
  holdingRegionId: string
  existingRegionIds: Set<string>
}

export type CheckProposalResult = { ok: true; regions: PartitionRegion[] } | { ok: false; errors: string[] }

/** Normalizes and validates a proposal (fresh or hand-edited) before it is reviewed or written. */
export function checkProposal(input: CheckProposalInput): CheckProposalResult {
  const errors: string[] = []
  const townKeys = new Set(input.towns.map(t => t.townKey.trim().toLowerCase()))
  const seen = new Set<string>()
  const regions: PartitionRegion[] = []
  const newByName = new Map<string, PartitionRegion>()

  for (const entry of input.regions) {
    const existingRegionId = entry.existingRegionId || null
    const keys = (entry.townKeys ?? []).map(k => k.trim().toLowerCase())
    if (existingRegionId === input.holdingRegionId) errors.push(`${entry.name}: cannot target the holding region`)
    else if (existingRegionId && !input.existingRegionIds.has(existingRegionId)) errors.push(`${entry.name}: unknown existingRegionId ${existingRegionId}`)
    for (const k of keys) {
      if (seen.has(k)) errors.push(`town ${k} is listed more than once`)
      seen.add(k)
      if (!townKeys.has(k)) errors.push(`town ${k} has no matching town entry`)
    }
    if (existingRegionId) {
      regions.push({ existingRegionId, name: entry.name, townKeys: keys })
      continue
    }
    const nameKey = normalizeRegionName(entry.name)
    const prior = newByName.get(nameKey)
    if (prior) prior.townKeys.push(...keys)
    else {
      const merged = { existingRegionId: null, name: entry.name, townKeys: keys }
      newByName.set(nameKey, merged)
      regions.push(merged)
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, regions }
}
