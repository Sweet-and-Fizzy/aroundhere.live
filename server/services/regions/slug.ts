import { normalizeRegionName } from './town-key'

function withSuffix(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export function deriveRegionSlug(name: string, takenSlugs: Set<string>): string {
  const base = normalizeRegionName(name)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return withSuffix(base || 'region', takenSlugs)
}

export function deriveVenueSlug(baseSlug: string, takenSlugs: Set<string>): string {
  return withSuffix(baseSlug, takenSlugs)
}
