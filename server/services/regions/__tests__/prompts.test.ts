import { describe, it, expect } from 'vitest'
import { buildAssignPrompt, buildPartitionPrompt } from '../prompts'

const town = { townKey: 'beverly|ma', city: 'Beverly', state: 'MA', lat: 42.558, lng: -70.88 }
const region = (id: string, n: number) => ({ id, name: `Region ${id}`, distanceMiles: 10, towns: Array.from({ length: n }, (_, i) => `town${i}|ma`) })

describe('buildAssignPrompt', () => {
  it('includes the town, each candidate id, and the none option', () => {
    const p = buildAssignPrompt(town, [region('a', 3), region('b', 3)])
    expect(p).toContain('beverly|ma')
    expect(p).toContain('"a"')
    expect(p).toContain('"b"')
    expect(p).toContain('"regionId": null')
  })
  it('caps member towns at 25 per region', () => {
    const p = buildAssignPrompt(town, [region('a', 40)])
    expect(p).toContain('town24|ma')
    expect(p).not.toContain('town25|ma')
  })
  it('prints "(none)" when candidates is empty', () => {
    const p = buildAssignPrompt(town, [])
    expect(p).toContain('(none)')
  })
})

describe('buildPartitionPrompt', () => {
  it('lists every town, nearby regions, fixed towns, and the "in" naming rule', () => {
    const p = buildPartitionPrompt([town, { ...town, townKey: 'salem|ma', city: 'Salem' }], [region('pv', 2)], [{ townKey: 'salem|ma', regionId: 'pv' }])
    expect(p).toContain('beverly|ma')
    expect(p).toContain('salem|ma')
    expect(p).toContain('"pv"')
    expect(p).toMatch(/FIXED/)
    expect(p).toMatch(/after the word "in"/)
  })
})
