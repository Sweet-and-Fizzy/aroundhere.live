import { describe, it, expect } from 'vitest'
import { pickSeedRegion } from '../seed'

const old = new Date('2025-01-01')
const newer = new Date('2026-01-01')

describe('pickSeedRegion', () => {
  it('returns null for no venues', () => {
    expect(pickSeedRegion([])).toBeNull()
  })
  it('returns the only region without conflict', () => {
    expect(pickSeedRegion([{ regionId: 'pv', regionCreatedAt: old }])).toEqual({ regionId: 'pv', conflict: false })
  })
  it('picks the majority region and flags conflict', () => {
    const r = pickSeedRegion([
      { regionId: 'bk', regionCreatedAt: newer },
      { regionId: 'pv', regionCreatedAt: old },
      { regionId: 'bk', regionCreatedAt: newer },
    ])
    expect(r).toEqual({ regionId: 'bk', conflict: true })
  })
  it('breaks a tie by the oldest region', () => {
    const r = pickSeedRegion([
      { regionId: 'bk', regionCreatedAt: newer },
      { regionId: 'pv', regionCreatedAt: old },
    ])
    expect(r).toEqual({ regionId: 'pv', conflict: true })
  })
})
