import { cleanRegionName, normalizeRegionName } from './town-key'
import type { PartitionRegion, Validation } from './types'

export function parseJsonObject(raw: string): Validation<Record<string, unknown>> {
  let text = raw.trim()
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) text = fence[1]!.trim()
  if (!text.startsWith('{') || !text.endsWith('}')) return { ok: false, errors: ['response is not a bare JSON object'] }
  try {
    const value = JSON.parse(text)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['response is not a JSON object'] }
    return { ok: true, value }
  } catch (e) {
    return { ok: false, errors: [`invalid JSON: ${(e as Error).message}`] }
  }
}

export function validateAssignment(raw: string, offeredIds: string[]): Validation<string | null> {
  const parsed = parseJsonObject(raw)
  if (!parsed.ok) return parsed
  if (!('regionId' in parsed.value)) return { ok: false, errors: ['missing regionId'] }
  const id = parsed.value.regionId
  if (id === null) return { ok: true, value: null }
  if (typeof id !== 'string' || !offeredIds.includes(id)) return { ok: false, errors: [`regionId ${String(id)} was not offered`] }
  return { ok: true, value: id }
}

function normalizeTownKey(key: string): string {
  return typeof key === 'string' ? key.trim().toLowerCase() : ''
}

export function validatePartition(
  raw: string,
  requestedKeys: string[],
  offered: { id: string; name: string }[],
  fixed: { townKey: string; regionId: string }[] = [],
): Validation<PartitionRegion[]> {
  const parsed = parseJsonObject(raw)
  if (!parsed.ok) return parsed
  const list = parsed.value.regions
  if (!Array.isArray(list)) return { ok: false, errors: ['missing regions array'] }

  const errors: string[] = []
  const offeredById = new Map(offered.map(o => [o.id, o]))
  const offeredByNorm = new Map(offered.map(o => [normalizeRegionName(o.name), o]))
  const fixedById = new Map(fixed.map(f => [f.regionId, f.townKey]))
  const allowedIds = new Set([...offeredById.keys(), ...fixedById.keys()])
  const merged = new Map<string, PartitionRegion>() // key: existing id or "new:<normalized name>"
  const seen = new Map<string, number>()
  const normalizedRequestedKeys = new Set(requestedKeys.map(normalizeTownKey))

  for (const entry of list as Array<Record<string, unknown>>) {
    const towns = entry?.towns
    if (!Array.isArray(towns)) {
      errors.push('entry has non-array towns')
      continue
    }
    const normalizedTowns: string[] = []
    for (const t of towns) {
      if (typeof t !== 'string') {
        errors.push('towns array contains non-string')
        continue
      }
      normalizedTowns.push(normalizeTownKey(t))
    }
    if (errors.length > 0 && errors[errors.length - 1].startsWith('towns array contains non-string')) {
      continue
    }

    let existingId = typeof entry?.existingRegionId === 'string' ? entry.existingRegionId : null
    const name = typeof entry?.name === 'string' ? cleanRegionName(entry.name) : ''

    if (existingId && !allowedIds.has(existingId)) { errors.push(`unknown existingRegionId ${existingId}`); continue }

    // Check for name conflict: if existingId is provided and name normalizes to a different offered region
    if (existingId && name) {
      const matchedOffered = offeredByNorm.get(normalizeRegionName(name))
      if (matchedOffered && matchedOffered.id !== existingId) {
        errors.push(`entry names "${name}" but existingRegionId ${existingId} is "${offeredById.get(existingId)?.name || existingId}"`)
        continue
      }
    }

    if (!existingId) {
      if (!name) { errors.push('region with empty name'); continue }
      const match = offeredByNorm.get(normalizeRegionName(name))
      if (match) existingId = match.id
    }
    const key = existingId ?? `new:${normalizeRegionName(name)}`
    let regionName = name
    if (existingId) {
      // Use offered region name if available, otherwise use entry name or id
      regionName = offeredById.get(existingId)?.name ?? (name || existingId)
    }
    const target = merged.get(key) ?? {
      existingRegionId: existingId,
      name: regionName,
      townKeys: [],
    }
    for (const t of normalizedTowns) {
      target.townKeys.push(t)
      seen.set(t, (seen.get(t) ?? 0) + 1)
    }
    merged.set(key, target)
  }

  for (const k of normalizedRequestedKeys) if (!seen.has(k)) errors.push(`town ${k} missing`)
  for (const [k, n] of seen) {
    if (!normalizedRequestedKeys.has(k)) errors.push(`unknown town ${k}`)
    if (n > 1) errors.push(`town ${k} listed ${n} times`)
  }
  for (const f of fixed) {
    const normalizedFixedKey = normalizeTownKey(f.townKey)
    const placed = [...merged.values()].find(r => r.townKeys.includes(normalizedFixedKey))
    if (placed && placed.existingRegionId !== f.regionId) errors.push(`fixed town ${f.townKey} moved`)
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: [...merged.values()].filter(r => r.townKeys.length > 0) }
}
