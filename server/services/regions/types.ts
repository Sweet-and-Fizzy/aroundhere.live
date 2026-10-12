export type VenueLocation = { city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null }
export type RegionSummary = { id: string; name: string; centroidLat: number; centroidLng: number; towns: string[] }
export type ResolveResult = { regionId: string; via: 'mapped' | 'llm' | 'holding' }
export type TownInput = { townKey: string; city: string; state: string; lat: number; lng: number }
export type CandidateRegion = { id: string; name: string; distanceMiles: number; towns: string[] }
export type PartitionRegion = { existingRegionId: string | null; name: string; townKeys: string[] }
export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] }
