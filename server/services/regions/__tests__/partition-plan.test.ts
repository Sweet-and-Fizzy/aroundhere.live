import { describe, it, expect } from 'vitest'
import { planPartitionWrite, findNameCollisions, type PartitionPlanInput } from '../partition-plan'

const t = (townKey: string) => [townKey, { townKey, city: townKey.split('|')[0]!, state: 'MA', lat: 42.5, lng: -70.9 }] as const

function input(over: Partial<PartitionPlanInput> = {}): PartitionPlanInput {
  return {
    proposal: [
      { existingRegionId: null, name: 'the North Shore', townKeys: ['salem|ma', 'beverly|ma'] },
      { existingRegionId: 'pv', name: 'the Pioneer Valley', townKeys: ['easthampton|ma'] },
    ],
    towns: new Map([t('salem|ma'), t('beverly|ma'), t('easthampton|ma')]),
    adminTownKeys: new Set(),
    venues: [
      { id: 'v1', slug: 'the-hangar', regionId: 'holding', townKey: 'salem|ma' },
      { id: 'v2', slug: 'gulu-gulu', regionId: 'holding', townKey: 'salem|ma' },
      { id: 'v3', slug: 'the-hangar', regionId: 'holding', townKey: 'beverly|ma' },
      { id: 'v4', slug: 'cafe', regionId: 'pv', townKey: 'easthampton|ma' },
    ],
    venueSlugsByRegion: new Map([['pv', new Set(['cafe'])], ['holding', new Set(['the-hangar', 'gulu-gulu'])]]),
    takenRegionSlugs: new Set(['pioneer-valley', 'other']),
    ...over,
  }
}

describe('planPartitionWrite', () => {
  it('creates new regions with derived slugs', () => {
    expect(planPartitionWrite(input()).newRegions).toEqual([{ name: 'the North Shore', slug: 'north-shore' }])
  })

  it('upserts every proposed town with its region ref', () => {
    const plan = planPartitionWrite(input())
    expect(plan.townUpserts.map(u => [u.townKey, u.region])).toEqual([
      ['salem|ma', { newIndex: 0 }], ['beverly|ma', { newIndex: 0 }], ['easthampton|ma', { existingId: 'pv' }],
    ])
  })

  it('moves holding-region venues and leaves venues already in place alone', () => {
    const plan = planPartitionWrite(input())
    expect(plan.venueMoves.map(m => m.venueId)).toEqual(['v1', 'v2', 'v3'])
  })

  it('suffixes an incoming venue slug that collides in the target region', () => {
    const plan = planPartitionWrite(input())
    expect(plan.venueMoves.find(m => m.venueId === 'v1')!.newSlug).toBeNull()
    expect(plan.venueMoves.find(m => m.venueId === 'v3')!.newSlug).toBe('the-hangar-2')
  })

  it('suffixes against venues already in an existing target region', () => {
    const plan = planPartitionWrite(input({
      venues: [{ id: 'v9', slug: 'cafe', regionId: 'holding', townKey: 'easthampton|ma' }],
    }))
    expect(plan.venueMoves).toEqual([{ venueId: 'v9', fromRegionId: 'holding', region: { existingId: 'pv' }, newSlug: 'cafe-2' }])
  })

  it('never touches ADMIN towns or their venues', () => {
    const plan = planPartitionWrite(input({ adminTownKeys: new Set(['beverly|ma']) }))
    expect(plan.townUpserts.map(u => u.townKey)).not.toContain('beverly|ma')
    expect(plan.venueMoves.map(m => m.venueId)).not.toContain('v3')
  })
})

describe('findNameCollisions', () => {
  const proposal = [
    { existingRegionId: null, name: 'the North Shore', townKeys: ['salem|ma'] },
    { existingRegionId: null, name: 'Cape Ann', townKeys: ['gloucester|ma'] },
    { existingRegionId: 'pv', name: 'the Pioneer Valley', townKeys: ['easthampton|ma'] },
  ]

  it('flags new regions whose normalized name matches an existing region', () => {
    expect(findNameCollisions(proposal, ['North Shore', 'Other'])).toEqual(['the North Shore'])
  })

  it('ignores entries that reuse an existing region id', () => {
    expect(findNameCollisions(proposal, ['Pioneer Valley'])).toEqual([])
  })

  it('returns nothing when there are no collisions', () => {
    expect(findNameCollisions(proposal, ['Western Massachusetts'])).toEqual([])
  })
})
