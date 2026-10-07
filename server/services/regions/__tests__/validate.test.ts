import { describe, it, expect } from 'vitest'
import { parseJsonObject, validateAssignment, validatePartition } from '../validate'

describe('parseJsonObject', () => {
  it('parses a bare object', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })
  it('strips a ```json fence', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } })
  })
  it('rejects prose around JSON', () => {
    expect(parseJsonObject('Sure! {"a":1}').ok).toBe(false)
  })
  it('rejects arrays and malformed JSON', () => {
    expect(parseJsonObject('[1]').ok).toBe(false)
    expect(parseJsonObject('{a:1}').ok).toBe(false)
  })
})

describe('validateAssignment', () => {
  it('accepts an offered id', () => {
    expect(validateAssignment('{"regionId":"pv"}', ['pv', 'bk'])).toEqual({ ok: true, value: 'pv' })
  })
  it('accepts null as none', () => {
    expect(validateAssignment('{"regionId":null}', ['pv'])).toEqual({ ok: true, value: null })
  })
  it('rejects an id that was not offered', () => {
    expect(validateAssignment('{"regionId":"zz"}', ['pv']).ok).toBe(false)
  })
  it('rejects a new-region proposal', () => {
    expect(validateAssignment('{"new":"the North Shore"}', ['pv']).ok).toBe(false)
  })
  it('rejects malformed JSON', () => {
    expect(validateAssignment('nope', ['pv']).ok).toBe(false)
  })
})

describe('validatePartition', () => {
  const offered = [{ id: 'pv', name: 'the Pioneer Valley' }]
  const keys = ['salem|ma', 'beverly|ma', 'easthampton|ma']

  it('accepts a full partition with new and existing regions', () => {
    const raw = JSON.stringify({ regions: [
      { name: 'the North Shore', towns: ['salem|ma', 'beverly|ma'] },
      { name: 'the Pioneer Valley', existingRegionId: 'pv', towns: ['easthampton|ma'] },
    ] })
    expect(validatePartition(raw, keys, offered)).toEqual({ ok: true, value: [
      { existingRegionId: null, name: 'the North Shore', townKeys: ['salem|ma', 'beverly|ma'] },
      { existingRegionId: 'pv', name: 'the Pioneer Valley', townKeys: ['easthampton|ma'] },
    ] })
  })

  it('treats a new name matching an existing region (after in/the/case) as that region', () => {
    const raw = JSON.stringify({ regions: [
      { name: 'Pioneer Valley', towns: ['easthampton|ma'] },
      { name: 'in the North Shore', towns: ['salem|ma', 'beverly|ma'] },
    ] })
    const r = validatePartition(raw, keys, offered)
    expect(r.ok && r.value[0]).toEqual({ existingRegionId: 'pv', name: 'the Pioneer Valley', townKeys: ['easthampton|ma'] })
    expect(r.ok && r.value[1]!.name).toBe('the North Shore')
  })

  it('merges two proposed regions with the same normalized name', () => {
    const raw = JSON.stringify({ regions: [
      { name: 'the North Shore', towns: ['salem|ma'] },
      { name: 'North Shore', towns: ['beverly|ma'] },
      { name: 'the Pioneer Valley', existingRegionId: 'pv', towns: ['easthampton|ma'] },
    ] })
    const r = validatePartition(raw, keys, offered)
    expect(r.ok && r.value.filter(x => x.existingRegionId === null)).toEqual([
      { existingRegionId: null, name: 'the North Shore', townKeys: ['salem|ma', 'beverly|ma'] },
    ])
  })

  it.each([
    ['a missing town', { regions: [{ name: 'the North Shore', towns: ['salem|ma', 'beverly|ma'] }] }],
    ['a duplicated town', { regions: [{ name: 'A', towns: ['salem|ma', 'beverly|ma', 'easthampton|ma', 'salem|ma'] }] }],
    ['an unknown town', { regions: [{ name: 'A', towns: [...keys, 'gloucester|ma'] }] }],
    ['an unknown existing id', { regions: [{ name: 'A', existingRegionId: 'zz', towns: keys }] }],
    ['an empty name', { regions: [{ name: '  ', towns: keys }] }],
    ['a missing regions array', { foo: [] }],
  ])('rejects %s and persists nothing', (_label, body) => {
    expect(validatePartition(JSON.stringify(body), keys, offered).ok).toBe(false)
  })

  it('rejects a partition that moves a fixed (ADMIN) town', () => {
    const raw = JSON.stringify({ regions: [{ name: 'the North Shore', towns: keys }] })
    expect(validatePartition(raw, keys, offered, [{ townKey: 'easthampton|ma', regionId: 'pv' }]).ok).toBe(false)
  })
})
