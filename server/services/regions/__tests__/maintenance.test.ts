import { describe, it, expect } from 'vitest'
import { runRegionMaintenance, formatMaintenanceReport, type MaintenanceIO } from '../maintenance'
import type { RegionStore } from '../store'

function deps(towns: Record<string, string>, slugsInTarget: string[] = []) {
  const moves: Array<[string, string, string | null]> = []
  const recomputed: string[][] = []
  const store: RegionStore = {
    findTown: async k => (towns[k] ? { regionId: towns[k]! } : null),
    insertTown: async () => {},
    listRegionsWithCentroids: async () => [],
    getHoldingRegionId: async () => 'holding',
    recomputeRegionStats: async ids => { recomputed.push(ids) },
  }
  const io: MaintenanceIO = {
    listHoldingVenues: async () => [
      { id: 'v1', name: 'Gulu-Gulu', slug: 'gulu-gulu', city: 'Salem', state: 'MA', latitude: 42.52, longitude: -70.89 },
      { id: 'v2', name: 'Mystery Bar', slug: 'mystery-bar', city: 'Nowhere', state: 'MA', latitude: 42, longitude: -71 },
    ],
    venueSlugsInRegion: async () => new Set(slugsInTarget),
    moveVenue: async (id, regionId, newSlug) => { moves.push([id, regionId, newSlug]) },
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

  it('formats a readable Slack summary', () => {
    const text = formatMaintenanceReport({ moved: [{ venue: 'A', regionId: 'ns' }], stillHolding: [{ venue: 'B', townKey: 'x|ma' }] })
    expect(text).toContain('Moved 1')
    expect(text).toContain('B (x|ma)')
  })
})
