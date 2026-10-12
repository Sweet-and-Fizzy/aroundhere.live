import { describe, it, expect } from 'vitest'
import { runRegionMaintenance, formatMaintenanceReport, type MaintenanceIO } from '../maintenance'
import type { RegionStore } from '../store'

function deps(
  towns: Record<string, string>,
  slugsInTarget: string[] = [],
  throwOnVenue: string | null = null,
  venues?: Array<{ id: string; name: string; slug: string; city: string | null; state: string | null; latitude: number | null; longitude: number | null }>,
) {
  const moves: Array<[string, string, string | null]> = []
  const recomputed: string[][] = []
  const venueList = venues || [
    { id: 'v1', name: 'Gulu-Gulu', slug: 'gulu-gulu', city: 'Salem', state: 'MA', latitude: 42.52, longitude: -70.89 },
    { id: 'v2', name: 'Mystery Bar', slug: 'mystery-bar', city: 'Nowhere', state: 'MA', latitude: 42, longitude: -71 },
  ]
  const venueMap = new Map(venueList.map(v => [v.id, v.slug]))
  const existingSlugs = new Set(slugsInTarget)
  const store: RegionStore = {
    findTown: async k => (towns[k] ? { regionId: towns[k]! } : null),
    insertTown: async () => {},
    listRegionsWithCentroids: async () => [],
    getHoldingRegionId: async () => 'holding',
    recomputeRegionStats: async ids => { recomputed.push(ids) },
  }
  const io: MaintenanceIO = {
    listHoldingVenues: async () => venueList,
    venueSlugsInRegion: async () => new Set(existingSlugs),
    moveVenue: async (id, regionId, newSlug) => {
      if (throwOnVenue && id === throwOnVenue) throw new Error('moveVenue failed')
      moves.push([id, regionId, newSlug])
      const slug = newSlug || venueMap.get(id)
      if (slug) existingSlugs.add(slug)
    },
    allRegionIds: async () => ['ns', 'holding'],
  }
  return { d: { store, io, llm: { complete: async () => ({ content: '{"regionId":null}' }) } }, moves, recomputed }
}

describe('runRegionMaintenance', () => {
  it('moves holding venues whose town is now mapped and reports the rest', async () => {
    const { d, moves, recomputed } = deps({ 'salem|ma': 'ns' })
    const report = await runRegionMaintenance(d)
    expect(moves).toEqual([['v1', 'ns', null]])
    expect(report.moved).toEqual([{ venue: 'Gulu-Gulu', regionId: 'ns' }])
    expect(report.stillHolding).toEqual([{ venue: 'Mystery Bar', townKey: 'nowhere|ma' }])
    expect(recomputed).toEqual([['ns', 'holding']])
  })

  it('suffixes the slug when the target region already has it', async () => {
    const { d, moves } = deps({ 'salem|ma': 'ns' }, ['gulu-gulu'])
    await runRegionMaintenance(d)
    expect(moves[0]).toEqual(['v1', 'ns', 'gulu-gulu-2'])
  })

  it('keeps a venue in holding when its town is mapped to the holding region', async () => {
    const { d, moves } = deps({ 'salem|ma': 'holding' }, ['gulu-gulu'])
    const report = await runRegionMaintenance(d)
    expect(moves).toEqual([])
    expect(report.moved).toEqual([])
    expect(report.stillHolding.map(h => h.venue)).toContain('Gulu-Gulu')
  })

  it('formats a readable Slack summary with singular/plural', () => {
    const text = formatMaintenanceReport({ moved: [{ venue: 'A', regionId: 'ns' }], stillHolding: [{ venue: 'B', townKey: 'x|ma' }], failed: [] })
    expect(text).toContain('Moved 1 venue')
    expect(text).toContain('1 venue still')
    expect(text).toContain('B (x|ma)')
  })

  it('handles moveVenue errors, continues with next venue, and still recomputes stats', async () => {
    const { d, moves, recomputed } = deps({ 'salem|ma': 'ns', 'nowhere|ma': 'ns' }, [], 'v1')
    const report = await runRegionMaintenance(d)
    expect(report.failed).toEqual([{ venue: 'Gulu-Gulu', error: 'moveVenue failed' }])
    expect(report.moved).toEqual([{ venue: 'Mystery Bar', regionId: 'ns' }])
    expect(moves).toEqual([['v2', 'ns', null]])
    expect(recomputed).toEqual([['ns', 'holding']])
  })

  it('suffixes second venue with same slug moving to same region', async () => {
    const { d, moves } = deps(
      { 'salem|ma': 'ns', 'nowhere|ma': 'ns' },
      [],
      null,
      [
        { id: 'v1', name: 'Gulu-Gulu', slug: 'shared', city: 'Salem', state: 'MA', latitude: 42.52, longitude: -70.89 },
        { id: 'v2', name: 'Mystery Bar', slug: 'shared', city: 'Nowhere', state: 'MA', latitude: 42, longitude: -71 },
      ],
    )
    await runRegionMaintenance(d)
    expect(moves).toEqual([
      ['v1', 'ns', null],
      ['v2', 'ns', 'shared-2'],
    ])
  })
})
