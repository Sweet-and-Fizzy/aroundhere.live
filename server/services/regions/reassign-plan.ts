export function planTownReassign(input: { venues: { id: string; name: string; slug: string }[]; targetSlugs: Set<string> }):
  { ok: true } | { ok: false; conflicts: string[] } {
  const conflicts = input.venues.filter(v => input.targetSlugs.has(v.slug)).map(v => `${v.name} (${v.slug})`)
  return conflicts.length ? { ok: false, conflicts } : { ok: true }
}
