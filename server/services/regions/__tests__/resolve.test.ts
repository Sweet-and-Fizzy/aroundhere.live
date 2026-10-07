import { describe, it, expect } from 'vitest'
import { resolveRegionForVenue, type LlmClient } from '../resolve'
import type { NewTownRow, RegionStore } from '../store'
import type { RegionSummary } from '../types'

const ns: RegionSummary = { id: 'ns', name: 'the North Shore', centroidLat: 42.52, centroidLng: -70.9, towns: ['salem|ma'] }
const beverly = { city: 'Beverly', state: 'MA', latitude: 42.558, longitude: -70.88 }

function setup(opts: { towns?: Record<string, string>; regions?: RegionSummary[]; llmReply?: string | Error; insertConflictWith?: string } = {}) {
  const towns = new Map(Object.entries(opts.towns ?? {}))
  const inserted: NewTownRow[] = []
  const llmCalls: string[] = []
  const store: RegionStore = {
    findTown: async k => (towns.has(k) ? { regionId: towns.get(k)! } : null),
    insertTown: async (row) => {
      if (opts.insertConflictWith) {
        towns.set(row.townKey, opts.insertConflictWith)
        throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
      }
      inserted.push(row)
      towns.set(row.townKey, row.regionId)
    },
    listRegionsWithCentroids: async () => opts.regions ?? [ns],
    getHoldingRegionId: async () => 'holding',
    recomputeRegionStats: async () => {},
  }
  const llm: LlmClient = {
    complete: async ({ messages }) => {
      llmCalls.push(messages[0]!.content)
      if (opts.llmReply instanceof Error) throw opts.llmReply
      return { content: opts.llmReply ?? '{"regionId":"ns"}' }
    },
  }
  return { deps: { store, llm }, inserted, llmCalls }
}

describe('resolveRegionForVenue', () => {
  it('uses a stored mapping without calling the LLM', async () => {
    const { deps, llmCalls } = setup({ towns: { 'beverly|ma': 'ns' } })
    expect(await resolveRegionForVenue(deps, beverly)).toEqual({ regionId: 'ns', via: 'mapped' })
    expect(llmCalls).toHaveLength(0)
  })

  it('asks the LLM for an unmapped town and persists the answer', async () => {
    const { deps, inserted } = setup()
    expect(await resolveRegionForVenue(deps, beverly)).toEqual({ regionId: 'ns', via: 'llm' })
    expect(inserted).toEqual([{ townKey: 'beverly|ma', city: 'Beverly', state: 'MA', regionId: 'ns', latitude: 42.558, longitude: -70.88, source: 'LLM' }])
  })

  it('persists a cleaned city when the venue city carries a state suffix', async () => {
    const { deps, inserted } = setup()
    await resolveRegionForVenue(deps, { ...beverly, city: 'Beverly, MA' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]!.city).toBe('Beverly')
    expect(inserted[0]!.townKey).toBe('beverly|ma')
  })

  it.each([
    ['the LLM answers none', { llmReply: '{"regionId":null}' }],
    ['the LLM throws', { llmReply: new Error('timeout') }],
    ['the LLM returns invalid JSON', { llmReply: 'I think North Shore' }],
    ['the LLM picks an id it was not offered', { llmReply: '{"regionId":"pv"}' }],
    ['no region is within 60 miles', { regions: [{ ...ns, centroidLat: 44.5, centroidLng: -73.2 }] }],
  ])('falls back to holding and persists nothing when %s', async (_label, opts) => {
    const { deps, inserted } = setup(opts)
    expect(await resolveRegionForVenue(deps, beverly)).toEqual({ regionId: 'holding', via: 'holding' })
    expect(inserted).toHaveLength(0)
  })

  it('falls back to holding for a venue with no city or no coordinates', async () => {
    const { deps, llmCalls } = setup()
    expect((await resolveRegionForVenue(deps, { state: 'MA', latitude: 42.5, longitude: -70.9 })).via).toBe('holding')
    expect((await resolveRegionForVenue(deps, { city: 'Beverly', state: 'MA' })).via).toBe('holding')
    expect(llmCalls).toHaveLength(0)
  })

  it('re-reads the stored row when a concurrent insert wins the unique townKey', async () => {
    const { deps } = setup({ insertConflictWith: 'ns-from-other-request' })
    expect(await resolveRegionForVenue(deps, beverly)).toEqual({ regionId: 'ns-from-other-request', via: 'mapped' })
  })
})
