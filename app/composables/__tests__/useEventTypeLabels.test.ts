import { describe, it, expect } from 'vitest'
import { SELECTABLE_EVENT_TYPES } from '../useEventTypeLabels'
import { EVENT_TYPES } from '../../../server/services/classifier/types'

describe('SELECTABLE_EVENT_TYPES', () => {
  it('only offers event types the favorites API accepts', () => {
    for (const type of SELECTABLE_EVENT_TYPES) {
      expect(EVENT_TYPES).toContain(type)
    }
  })

  it('offers every real event type except PRIVATE and OTHER', () => {
    const expected = EVENT_TYPES.filter(t => t !== 'PRIVATE' && t !== 'OTHER')
    expect([...SELECTABLE_EVENT_TYPES].sort()).toEqual([...expected].sort())
  })
})
