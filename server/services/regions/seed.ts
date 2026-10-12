export type SeedVenue = { regionId: string; regionCreatedAt: Date }

export function pickSeedRegion(venues: SeedVenue[]): { regionId: string; conflict: boolean } | null {
  if (venues.length === 0) return null
  const tally = new Map<string, { count: number; createdAt: Date }>()
  for (const v of venues) {
    const t = tally.get(v.regionId) ?? { count: 0, createdAt: v.regionCreatedAt }
    t.count++
    tally.set(v.regionId, t)
  }
  const [winner] = [...tally.entries()].sort(([idA, a], [idB, b]) =>
    b.count - a.count || a.createdAt.getTime() - b.createdAt.getTime() || idA.localeCompare(idB))
  return { regionId: winner![0], conflict: tally.size > 1 }
}
