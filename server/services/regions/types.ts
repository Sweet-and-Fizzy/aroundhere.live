export type VenueLocation = { city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null }
export type RegionSummary = { id: string; name: string; centroidLat: number; centroidLng: number; towns: string[] }
export type ResolveResult = { regionId: string; via: 'mapped' | 'llm' | 'nearest' | 'holding' }
