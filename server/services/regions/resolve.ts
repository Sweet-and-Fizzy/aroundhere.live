import { selectCandidateRegions } from '../../utils/geo'
import { buildAssignPrompt } from './prompts'
import type { RegionStore } from './store'
import { cleanTownCity, normalizeStateCode, normalizeTownKey } from './town-key'
import type { ResolveResult, VenueLocation } from './types'
import { validateAssignment } from './validate'

export type LlmClient = {
  complete(opts: {
    provider: 'anthropic'
    model: string
    messages: { role: 'user'; content: string }[]
    temperature: number
    maxTokens: number
  }): Promise<{ content: string }>
}

export type ResolveDeps = { store: RegionStore; llm: LlmClient }

export const ASSIGN_MODEL = 'claude-haiku-4-5-20251001'

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

/**
 * Region for a venue: stored town mapping, else an LLM pick among nearby
 * existing regions (persisted), else the holding region (nothing persisted).
 * Never call inside a Prisma transaction: it may make a network call.
 */
export async function resolveRegionForVenue(deps: ResolveDeps, venue: VenueLocation): Promise<ResolveResult> {
  const { store, llm } = deps
  const townKey = normalizeTownKey(venue.city, venue.state)
  const holding = async (): Promise<ResolveResult> => ({ regionId: await store.getHoldingRegionId(), via: 'holding' })

  if (!townKey) return holding()

  const mapped = await store.findTown(townKey)
  if (mapped) return { regionId: mapped.regionId, via: 'mapped' }

  if (venue.latitude == null || venue.longitude == null) return holding()

  const candidates = selectCandidateRegions(await store.listRegionsWithCentroids(), venue.latitude, venue.longitude)
  if (candidates.length === 0) return holding()

  const town = { townKey, city: cleanTownCity(venue.city, venue.state)!, state: normalizeStateCode(venue.state)!.toUpperCase(), lat: venue.latitude, lng: venue.longitude }
  let regionId: string | null
  try {
    const response = await llm.complete({
      provider: 'anthropic',
      model: ASSIGN_MODEL,
      messages: [{ role: 'user', content: buildAssignPrompt(town, candidates) }],
      temperature: 0,
      maxTokens: 100,
    })
    const result = validateAssignment(response.content, candidates.map(c => c.id))
    if (!result.ok) {
      console.warn(`[Regions] Invalid assignment for ${townKey}: ${result.errors.join('; ')}`)
      return holding()
    }
    regionId = result.value
  } catch (e) {
    console.warn(`[Regions] Assignment failed for ${townKey}:`, e)
    return holding()
  }
  if (!regionId) return holding()

  try {
    await store.insertTown({ townKey, city: town.city, state: town.state, regionId, latitude: town.lat, longitude: town.lng, source: 'LLM' })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const winner = await store.findTown(townKey)
    if (winner) return { regionId: winner.regionId, via: 'mapped' }
    throw e
  }
  return { regionId, via: 'llm' }
}
