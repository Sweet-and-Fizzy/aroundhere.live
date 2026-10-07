import { describe, it, expect } from 'vitest'
import { planTownReassign } from '../reassign-plan'

describe('planTownReassign', () => {
  it('allows a move with no slug collisions', () => {
    expect(planTownReassign({ venues: [{ id: 'v1', name: 'Gulu-Gulu', slug: 'gulu-gulu' }], targetSlugs: new Set(['other']) })).toEqual({ ok: true })
  })
  it('refuses and names each colliding venue', () => {
    const r = planTownReassign({
      venues: [{ id: 'v1', name: 'The Hangar', slug: 'the-hangar' }, { id: 'v2', name: 'Cafe', slug: 'cafe' }],
      targetSlugs: new Set(['the-hangar']),
    })
    expect(r).toEqual({ ok: false, conflicts: ['The Hangar (the-hangar)'] })
  })
})
