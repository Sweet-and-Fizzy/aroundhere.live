export function planTownReassign(input: { venues: { id: string; name: string; slug: string }[]; targetSlugs: Set<string> }):
  { ok: true } | { ok: false; conflicts: string[] } {
  const conflicts = input.venues.filter(v => input.targetSlugs.has(v.slug)).map(v => `${v.name} (${v.slug})`)
  const bySlug = new Map<string, typeof input.venues>()
  for (const v of input.venues) bySlug.set(v.slug, [...(bySlug.get(v.slug) ?? []), v])
  for (const group of bySlug.values()) {
    if (group.length < 2) continue
    for (const v of group) {
      const label = `${v.name} (${v.slug})`
      if (!conflicts.includes(label)) conflicts.push(label)
    }
  }
  return conflicts.length ? { ok: false, conflicts } : { ok: true }
}
