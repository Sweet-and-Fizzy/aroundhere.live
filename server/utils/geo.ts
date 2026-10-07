export const HOLDING_REGION_SLUG = 'other'

export type RegionPoint = { id: string; name: string; centroidLat: number; centroidLng: number }

/** Great-circle distance in miles. */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function nearestRegion<T extends RegionPoint>(regions: T[], lat: number, lng: number): { region: T; distance: number } | null {
  let best: { region: T; distance: number } | null = null
  for (const region of regions) {
    const distance = haversineDistance(lat, lng, region.centroidLat, region.centroidLng)
    if (!best || distance < best.distance) best = { region, distance }
  }
  return best
}

export function selectCandidateRegions<T extends RegionPoint>(
  regions: T[],
  lat: number,
  lng: number,
  opts: { maxMiles?: number; limit?: number } = {},
): Array<T & { distanceMiles: number }> {
  const { maxMiles = 60, limit = 5 } = opts
  return regions
    .map(r => ({ ...r, distanceMiles: haversineDistance(lat, lng, r.centroidLat, r.centroidLng) }))
    .filter(r => r.distanceMiles <= maxMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, limit)
}
