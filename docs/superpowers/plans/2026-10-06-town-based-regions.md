# Town-Based Regions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DBSCAN region clustering with a persisted town-to-region mapping so region identity is stable, boundaries follow cultural lines, and new venues land in the right region at creation.

**Architecture:** A `region_towns` table maps normalized `(city, state)` keys to regions. All logic lives in pure functions under `server/services/regions/` (key normalization, slugs, prompts, validation, write planning) with I/O behind a small `RegionStore` interface so it is testable without a database. New regions are only created by an operator-reviewed partition script; single towns are assigned to existing regions by an LLM, or wait in the holding region (`slug = 'other'`).

**Tech Stack:** Nuxt 4 (Nitro server routes), Prisma 7 with `@prisma/adapter-pg`, PostgreSQL, vitest (happy-dom, pure-function tests), `llmService` from `server/services/llm`, Nuxt UI v3.

**Spec:** `docs/superpowers/specs/2026-10-06-town-based-regions-design.md` (v3)

## Global Constraints

- Region id, name and slug never change except by explicit admin/SQL action. Slugs are derived once at creation and never recomputed.
- Region names are written to follow "in": `the Pioneer Valley`, `the North Shore`, `Western Massachusetts`. Never store a leading `in `.
- The holding region is the existing region with slug `other`. It is excluded from region pickers (`/api/regions`, `/api/user/preferences` availableRegions), from nearest-region lookup, and from LLM candidate lists.
- No LLM call inside a Prisma `$transaction`.
- Existing venue slugs/URLs never change. On a collision, the incoming venue's slug gets `-2`, `-3`, ...
- Tests are pure-function vitest tests. No test database, no `vi.mock` of modules; inject fakes via function parameters.
- `server/` code may not import from `app/`. Tests import server code with relative paths (in Nuxt, `~` resolves to `app/`; in vitest, `~` is the repo root).
- Prod DB writes: write a SQL file, validate it, and Andrew runs it himself. Never run prod writes from a task.
- Commits: no `Co-Authored-By` or Claude attribution lines. Run `npx eslint --fix <files>` and `npx nuxi typecheck` (the lint-staged hook) before each commit.
- Single-town assignment model: `claude-haiku-4-5-20251001`, temperature 0. Partition model: `claude-sonnet-5-5`, temperature 0. Provider `anthropic`.
- Candidate regions for a town: the 5 nearest non-holding regions with a centroid within 60 miles.

## Review Focus

1. **A town whose venues were split across regions by DBSCAN** (e.g. Easthampton venues in two regions): seeding must pick one region deterministically and print the conflict, never insert two rows or crash. Owner: Task 6 (`pickSeedRegion` tie test).
2. **City strings with state baked in** (`"Northampton, MA"`, `"Boston MA"`) plus a separate state field: must produce the same key as the clean form, or the town gets asked about twice and may land in two regions. Owner: Task 4.
3. **LLM proposes a "new" region name that is an existing name with different decoration** (`"North Shore"` vs existing `"the North Shore"`, or `"in the Berkshires"`): must reuse the existing region, never create a near-duplicate. Owner: Task 7 (`validatePartition` normalization test).
4. **Moving a venue into a region that already has a venue with the same slug** (two "The Hangar"s): must suffix the incoming slug, never violate `@@unique([regionId, slug])` or roll back a whole partition write. Owner: Task 9 (`planPartitionWrite` collision test) and Task 11 (`planTownReassign`).
5. **Two venues in the same new town approved at the same moment**: the second `insertTown` hits the unique `townKey`; it must re-read and use the stored mapping, not error out of venue approval. Owner: Task 8 (P2002 test).

---

## File Structure

| File | Responsibility |
|---|---|
| `server/utils/geo.ts` (create) | `haversineDistance`, `nearestRegion` (pure), `selectCandidateRegions` (pure) |
| `server/utils/find-nearest-region.ts` (modify) | DB wrapper over `nearestRegion`; excludes holding region |
| `server/services/regions/store.ts` (create) | `RegionStore` interface + `createPrismaRegionStore(prisma)` |
| `server/services/regions/resolve.ts` (create) | `resolveRegionForVenue(deps, venue)` |
| `server/services/regions/town-key.ts` (create) | `normalizeTownKey`, `normalizeRegionName` |
| `server/services/regions/slug.ts` (create) | `deriveRegionSlug`, `deriveVenueSlug` |
| `server/services/regions/seed.ts` (create) | `pickSeedRegion` |
| `server/services/regions/prompts.ts` (create) | `buildAssignPrompt`, `buildPartitionPrompt` |
| `server/services/regions/validate.ts` (create) | `parseJsonObject`, `validateAssignment`, `validatePartition` |
| `server/services/regions/partition-plan.ts` (create) | `planPartitionWrite` |
| `server/services/regions/reassign-plan.ts` (create) | `planTownReassign` |
| `server/services/regions/maintenance.ts` (create) | `runRegionMaintenance(deps)` |
| `server/services/regions/types.ts` (create) | Shared types |
| `server/services/regions/__tests__/*.test.ts` (create) | Unit tests |
| `scripts/seed-region-towns.ts`, `scripts/partition-regions.ts` (create) | Operator scripts |
| `scripts/sql/2026-10-06-region-cleanup.sql` (create) | One-time prod cleanup, run by Andrew |
| `server/api/cron/regions-maintenance.post.ts` (create) | Weekly job route |
| `server/api/admin/regions/index.get.ts`, `server/api/admin/region-towns/[id].patch.ts` (create) | Admin API |
| `app/pages/admin/regions.vue` (create) | Admin UI |
| Deleted in Task 5 | `server/services/clustering/`, `server/api/cron/cluster-regions.post.ts`, `scripts/delete-auto-regions.ts`, `scripts/test-clustering.ts` |

---

# Phase 1: Immediate fixes

Phase 1 ships on its own. It stops misfiling and churn before any schema change.

### Task 1: Consolidate geo helpers and nearest-region lookup

**Files:**
- Create: `server/utils/geo.ts`
- Create: `server/utils/__tests__/geo.test.ts`
- Modify: `server/utils/find-nearest-region.ts` (whole file)
- Modify: `server/api/regions/nearest.get.ts` (whole file)
- Modify: `server/api/auth/verify.get.ts` (the nearest-region loop, around lines 100-145)

**Interfaces:**
- Produces:
  - `haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number` (miles)
  - `type RegionPoint = { id: string; name: string; centroidLat: number; centroidLng: number }`
  - `nearestRegion<T extends RegionPoint>(regions: T[], lat: number, lng: number): { region: T; distance: number } | null`
  - `selectCandidateRegions<T extends RegionPoint>(regions: T[], lat: number, lng: number, opts?: { maxMiles?: number; limit?: number }): Array<T & { distanceMiles: number }>` (defaults 60 / 5, sorted nearest first)
  - `HOLDING_REGION_SLUG = 'other'`
  - `findNearestRegion(prisma, lat, lng): Promise<{ region: {id,name,slug,timezone,centroidLat,centroidLng}; distance: number } | null>` (excludes holding region and inactive regions)

- [ ] **Step 1: Write the failing test**

```ts
// server/utils/__tests__/geo.test.ts
import { describe, it, expect } from 'vitest'
import { haversineDistance, nearestRegion, selectCandidateRegions } from '../geo'

const northampton = { id: 'pv', name: 'the Pioneer Valley', centroidLat: 42.3251, centroidLng: -72.6412 }
const pittsfield = { id: 'bk', name: 'the Berkshires', centroidLat: 42.4501, centroidLng: -73.2454 }
const boston = { id: 'bos', name: 'Greater Boston', centroidLat: 42.3601, centroidLng: -71.0589 }

describe('haversineDistance', () => {
  it('is zero for the same point', () => {
    expect(haversineDistance(42, -72, 42, -72)).toBe(0)
  })
  it('measures Northampton to Boston at about 82 miles', () => {
    const d = haversineDistance(42.3251, -72.6412, 42.3601, -71.0589)
    expect(d).toBeGreaterThan(78)
    expect(d).toBeLessThan(86)
  })
})

describe('nearestRegion', () => {
  it('returns null for no regions', () => {
    expect(nearestRegion([], 42, -72)).toBeNull()
  })
  it('picks the closest centroid', () => {
    const result = nearestRegion([pittsfield, boston, northampton], 42.27, -72.67) // Easthampton
    expect(result?.region.id).toBe('pv')
  })
})

describe('selectCandidateRegions', () => {
  it('keeps only regions within maxMiles, nearest first', () => {
    const result = selectCandidateRegions([boston, pittsfield, northampton], 42.27, -72.67, { maxMiles: 60 })
    expect(result.map(r => r.id)).toEqual(['pv', 'bk'])
    expect(result[0]!.distanceMiles).toBeLessThan(result[1]!.distanceMiles)
  })
  it('caps the list at limit', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...northampton, id: `r${i}`, centroidLat: 42.3 + i * 0.01 }))
    expect(selectCandidateRegions(many, 42.3, -72.64, { limit: 5 })).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/utils/__tests__/geo.test.ts`
Expected: FAIL, cannot resolve `../geo`

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/geo.ts
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
```

Replace `server/utils/find-nearest-region.ts` with:

```ts
import type { PrismaClient } from '@prisma/client'
import { HOLDING_REGION_SLUG, nearestRegion } from './geo'

/** Nearest active, non-holding region by centroid. Null if none have centroids. */
export async function findNearestRegion(prisma: PrismaClient, lat: number, lng: number) {
  const regions = await prisma.region.findMany({
    where: {
      isActive: true,
      slug: { not: HOLDING_REGION_SLUG },
      centroidLat: { not: null },
      centroidLng: { not: null },
    },
    select: { id: true, name: true, slug: true, timezone: true, centroidLat: true, centroidLng: true },
  })
  const points = regions.map(r => ({ ...r, centroidLat: r.centroidLat!, centroidLng: r.centroidLng! }))
  return nearestRegion(points, lat, lng)
}
```

Replace the body of `server/api/regions/nearest.get.ts` after the lat/lng validation with:

```ts
  const result = await findNearestRegion(prisma, lat, lng)
  if (!result) {
    return { region: null, distance: null }
  }
  const { region, distance } = result
  return {
    region: {
      id: region.id,
      name: region.name,
      slug: region.slug,
      centroidLat: region.centroidLat,
      centroidLng: region.centroidLng,
    },
    distance: Math.round(distance * 10) / 10,
  }
```

and change its imports to `import prisma from '../../utils/prisma'` and `import { findNearestRegion } from '../../utils/find-nearest-region'` (drop the clustering import).

In `server/api/auth/verify.get.ts`, replace the `prisma.region.findMany(...)` call and the hand-written nearest loop with:

```ts
            const nearest = await findNearestRegion(prisma, location.lat, location.lng)
            // Only set region if within reasonable distance (e.g., 100 miles)
            if (nearest && nearest.distance <= 100) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: { regionId: nearest.region.id },
              })
            }
```

Update imports: remove `haversineDistance` from `../../services/clustering`, add `import { findNearestRegion } from '../../utils/find-nearest-region'`.

`server/api/events/submit.post.ts` calls `findNearestRegion(...)` and reads `region.id` and `region.timezone`. That call is replaced in Task 2, so leave it until then. Typecheck must still pass after this task, so for now change those two lines to:

```ts
      const nearest = await findNearestRegion(prisma, eventLocationLat, eventLocationLng)
      if (!nearest) throw createError({ statusCode: 500, message: 'No active regions available' })
      regionId = nearest.region.id
      timezone = nearest.region.timezone
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run server/utils/__tests__/geo.test.ts && npx nuxi typecheck`
Expected: tests PASS, typecheck clean

- [ ] **Step 5: Commit**

```bash
git add server/utils/geo.ts server/utils/__tests__/geo.test.ts server/utils/find-nearest-region.ts server/api/regions/nearest.get.ts server/api/auth/verify.get.ts server/api/events/submit.post.ts
git commit -m "refactor: consolidate haversine and nearest-region lookup, exclude holding region"
```

### Task 2: Holding region and interim `resolveRegionForVenue`

Phase 1 interim rule (a deliberate deviation from the spec's Phase 1 bullet, which would send new Pioneer Valley venues to the holding region): a venue with coordinates goes to the nearest region if that region's centroid is within 25 miles, otherwise to the holding region. Task 8 replaces this with the town-based logic.

**Files:**
- Create: `server/services/regions/types.ts`
- Create: `server/services/regions/store.ts`
- Create: `server/services/regions/resolve.ts`
- Create: `server/services/regions/__tests__/resolve.test.ts`
- Modify: `server/api/agent/create-venue.post.ts:20-31` (region lookup)
- Modify: `server/api/agent/approve.post.ts` (hoist region resolution out of `$transaction`, around lines 80-125)
- Modify: `server/api/events/submit.post.ts` (region selection for free-text locations, around lines 99-133)
- Modify: `server/api/regions.get.ts` and `server/api/user/preferences.get.ts:54` (exclude holding region)

**Interfaces:**
- Consumes: `selectCandidateRegions`, `HOLDING_REGION_SLUG` from Task 1
- Produces:
  ```ts
  // types.ts
  export type VenueLocation = { city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null }
  export type RegionSummary = { id: string; name: string; centroidLat: number; centroidLng: number; towns: string[] }
  export type ResolveResult = { regionId: string; via: 'mapped' | 'llm' | 'nearest' | 'holding' }
  // store.ts
  export interface RegionStore {
    listRegionsWithCentroids(): Promise<RegionSummary[]>   // active, non-holding, centroid not null
    getHoldingRegionId(): Promise<string>                   // finds or creates slug 'other', name 'Other'
  }
  export function createPrismaRegionStore(prisma: PrismaClient): RegionStore
  // resolve.ts
  export type ResolveDeps = { store: RegionStore }
  export async function resolveRegionForVenue(deps: ResolveDeps, venue: VenueLocation): Promise<ResolveResult>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// server/services/regions/__tests__/resolve.test.ts
import { describe, it, expect } from 'vitest'
import { resolveRegionForVenue } from '../resolve'
import type { RegionStore } from '../store'
import type { RegionSummary } from '../types'

const pv: RegionSummary = { id: 'pv', name: 'the Pioneer Valley', centroidLat: 42.3251, centroidLng: -72.6412, towns: [] }

function fakeStore(regions: RegionSummary[]): RegionStore {
  return {
    listRegionsWithCentroids: async () => regions,
    getHoldingRegionId: async () => 'holding',
  }
}

describe('resolveRegionForVenue (interim)', () => {
  it('uses the nearest region within 25 miles', async () => {
    const r = await resolveRegionForVenue({ store: fakeStore([pv]) }, { latitude: 42.27, longitude: -72.67 })
    expect(r).toEqual({ regionId: 'pv', via: 'nearest' })
  })
  it('sends a far venue to the holding region', async () => {
    const r = await resolveRegionForVenue({ store: fakeStore([pv]) }, { latitude: 42.36, longitude: -71.06 }) // Boston
    expect(r).toEqual({ regionId: 'holding', via: 'holding' })
  })
  it('sends a venue without coordinates to the holding region', async () => {
    const r = await resolveRegionForVenue({ store: fakeStore([pv]) }, { city: 'Northampton', state: 'MA' })
    expect(r).toEqual({ regionId: 'holding', via: 'holding' })
  })
  it('uses the holding region when no regions exist', async () => {
    const r = await resolveRegionForVenue({ store: fakeStore([]) }, { latitude: 42.27, longitude: -72.67 })
    expect(r.via).toBe('holding')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/regions/__tests__/resolve.test.ts`
Expected: FAIL, cannot resolve `../resolve`

- [ ] **Step 3: Write the implementation**

```ts
// server/services/regions/types.ts
export type VenueLocation = { city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null }
export type RegionSummary = { id: string; name: string; centroidLat: number; centroidLng: number; towns: string[] }
export type ResolveResult = { regionId: string; via: 'mapped' | 'llm' | 'nearest' | 'holding' }
```

```ts
// server/services/regions/store.ts
import type { PrismaClient } from '@prisma/client'
import { HOLDING_REGION_SLUG } from '../../utils/geo'
import type { RegionSummary } from './types'

export interface RegionStore {
  listRegionsWithCentroids(): Promise<RegionSummary[]>
  getHoldingRegionId(): Promise<string>
}

export function createPrismaRegionStore(prisma: PrismaClient): RegionStore {
  return {
    async listRegionsWithCentroids() {
      const regions = await prisma.region.findMany({
        where: { isActive: true, slug: { not: HOLDING_REGION_SLUG }, centroidLat: { not: null }, centroidLng: { not: null } },
        select: { id: true, name: true, centroidLat: true, centroidLng: true },
      })
      return regions.map(r => ({ id: r.id, name: r.name, centroidLat: r.centroidLat!, centroidLng: r.centroidLng!, towns: [] }))
    },
    async getHoldingRegionId() {
      const region = await prisma.region.upsert({
        where: { slug: HOLDING_REGION_SLUG },
        update: {},
        create: { name: 'Other', slug: HOLDING_REGION_SLUG, isActive: true },
        select: { id: true },
      })
      return region.id
    },
  }
}
```

```ts
// server/services/regions/resolve.ts
import { selectCandidateRegions } from '../../utils/geo'
import type { RegionStore } from './store'
import type { ResolveResult, VenueLocation } from './types'

export type ResolveDeps = { store: RegionStore }

const INTERIM_MAX_MILES = 25

/**
 * Pick the region for a new venue. Never misfiles: anything that does not
 * clearly belong to an existing region goes to the holding region.
 */
export async function resolveRegionForVenue(deps: ResolveDeps, venue: VenueLocation): Promise<ResolveResult> {
  const { store } = deps
  if (venue.latitude != null && venue.longitude != null) {
    const regions = await store.listRegionsWithCentroids()
    const [nearest] = selectCandidateRegions(regions, venue.latitude, venue.longitude, { maxMiles: INTERIM_MAX_MILES, limit: 1 })
    if (nearest) return { regionId: nearest.id, via: 'nearest' }
  }
  return { regionId: await store.getHoldingRegionId(), via: 'holding' }
}
```

Wire the callers.

`server/api/agent/create-venue.post.ts` does not geocode today, so a venue created through it has no coordinates, and the interim rule would send it to the holding region. Replace the "Get default region" block (lines 20-31) with the following. Add imports for `createPrismaRegionStore` and `resolveRegionForVenue` from `../../services/regions/store` and `../../services/regions/resolve`, and for `geocodeAddress` and `buildFullAddress` from `../../services/geocoding` (the same helpers `approve.post.ts` uses).

```ts
  let latitude: number | null = venueData.latitude ?? null
  let longitude: number | null = venueData.longitude ?? null
  if (latitude == null || longitude == null) {
    const fullAddress = buildFullAddress(venueData)
    const geocoded = fullAddress ? await geocodeAddress(fullAddress) : null
    if (geocoded) {
      latitude = geocoded.lat
      longitude = geocoded.lng
    }
  }

  const { regionId } = await resolveRegionForVenue(
    { store: createPrismaRegionStore(prisma) },
    { city: venueData.city, state: venueData.state, latitude, longitude },
  )
  const region = { id: regionId }
```

Also add `latitude, longitude,` to the `prisma.venue.create` data so the coordinates are stored. (The remaining code uses `region.id`, so keep that shape.)

`server/api/agent/approve.post.ts`: just before `const result = await prisma.$transaction(async (tx) => {`, add:

```ts
    let resolvedRegionId: string | null = null
    if (session.sessionType === 'VENUE_INFO' && venueData) {
      const resolved = await resolveRegionForVenue(
        { store: createPrismaRegionStore(prisma) },
        {
          city: venueData.city,
          state: venueData.state,
          latitude: geocodedLat ?? venueData.latitude,
          longitude: geocodedLng ?? venueData.longitude,
        },
      )
      resolvedRegionId = resolved.regionId
    }
```

Inside the transaction, delete the whole "Determine region based on location" block (the state-name `tx.region.findMany` and the first-active-region fallback) and replace it with:

```ts
        const regionId = resolvedRegionId!
```

The existing slug-uniqueness loop below it already uses `regionId`, so it now checks against the resolved region. Add the two imports.

`server/api/events/submit.post.ts`: replace the `if (eventLocationLat && eventLocationLng) { ... } else { ... }` region block with the following. Keep the existing geocoding above it. Because the city/state are parsed further down, move the "Try to extract city/state from address" block above this one first.

```ts
    const resolved = await resolveRegionForVenue(
      { store: createPrismaRegionStore(prisma) },
      { city: eventLocationCity, state: eventLocationState, latitude: eventLocationLat, longitude: eventLocationLng },
    )
    regionId = resolved.regionId
    const regionRow = await prisma.region.findUniqueOrThrow({ where: { id: regionId }, select: { timezone: true } })
    timezone = regionRow.timezone
```

Remove the now-unused `findNearestRegion` import from submit.

Exclude the holding region from pickers. In `server/api/regions.get.ts` change the `where` to `{ isActive: true, slug: { not: HOLDING_REGION_SLUG } }`. In `server/api/user/preferences.get.ts` add the same `slug: { not: HOLDING_REGION_SLUG }` to the `availableRegions` query's `where`. Import `HOLDING_REGION_SLUG` from the `utils/geo` path relative to each file.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run server/services/regions server/utils && npx nuxi typecheck`
Expected: PASS, clean

- [ ] **Step 5: Manual check (local dev DB)**

Run `npm run dev`, then create a venue through the admin agent flow with a Boston address. Confirm in `npx prisma studio` that the venue's region is `other`. Create one with a Northampton address and confirm it lands in the Pioneer Valley. Confirm `/settings` no longer lists "Other".

- [ ] **Step 6: Commit**

```bash
git add server/services/regions server/api/agent/create-venue.post.ts server/api/agent/approve.post.ts server/api/events/submit.post.ts server/api/regions.get.ts server/api/user/preferences.get.ts
git commit -m "fix: assign new venues via resolveRegionForVenue with a holding region instead of the oldest region"
```

### Task 3: Stop cluster churn and clean up prod regions

**Files:**
- Modify: `docker/crontab:29-30` (comment out cluster-regions)
- Create: `scripts/sql/2026-10-06-region-cleanup.sql`

- [ ] **Step 1: Disable the cron line**

In `docker/crontab`, prefix the `cluster-regions` line with `# disabled 2026-10-06, replaced by town-based regions: `. Keep the comment line above it.

- [ ] **Step 2: Write the cleanup SQL**

```sql
-- scripts/sql/2026-10-06-region-cleanup.sql
-- One-time cleanup of DBSCAN churn. Run by Andrew:
--   scp scripts/sql/2026-10-06-region-cleanup.sql deploy@138.197.34.3:/tmp/
--   ssh deploy@138.197.34.3 "docker exec -i aroundhere-db psql -U postgres -d local_music -v ON_ERROR_STOP=1" < scripts/sql/2026-10-06-region-cleanup.sql
BEGIN;

-- 1. Repoint playlists that sit on dead regions to the live region for the same area.
UPDATE spotify_playlists SET "regionId" = (SELECT id FROM regions WHERE slug = 'in-the-berkshires')
  WHERE "regionId" = (SELECT id FROM regions WHERE slug = 'berkshires');
UPDATE spotify_playlists SET "regionId" = (SELECT id FROM regions WHERE slug = 'in-the-greater-new-haven-area')
  WHERE "regionId" = (SELECT id FROM regions WHERE slug = 'new-haven-area');

-- 2. Delete regions nothing references.
DELETE FROM regions r
WHERE NOT EXISTS (SELECT 1 FROM venues v WHERE v."regionId" = r.id)
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e."regionId" = r.id)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u."regionId" = r.id)
  AND NOT EXISTS (SELECT 1 FROM spotify_playlists p WHERE p."regionId" = r.id)
  AND r.slug <> 'other';

-- 3. Names must read after "in"; drop a leading "in ". Slugs are unchanged.
UPDATE regions SET name = 'the Berkshires' WHERE slug = 'in-the-berkshires';
UPDATE regions SET name = 'the Greater New Haven area' WHERE slug = 'in-the-greater-new-haven-area';
UPDATE regions SET name = 'the Hartford area' WHERE slug = 'in-the-hartford-area';

SELECT name, slug, "isActive" FROM regions ORDER BY name;
COMMIT;
```

- [ ] **Step 3: Validate the SQL locally**

Restore a recent prod dump into a scratch DB, or run against the local dev DB after creating matching rows. Run the file with `psql -v ON_ERROR_STOP=1`. Confirm the final SELECT shows 5 regions (Pioneer Valley, Berkshires, Other, Greater New Haven area, Hartford area) and that `SELECT count(*) FROM spotify_playlists WHERE "regionId" NOT IN (SELECT id FROM regions)` is 0.

- [ ] **Step 4: Commit and hand off**

```bash
git add docker/crontab scripts/sql/2026-10-06-region-cleanup.sql
git commit -m "chore: disable region clustering cron, add one-time region cleanup SQL"
```

Tell Andrew the SQL is ready to run with the commands in the file header.

---

# Phase 2: Town-based regions

### Task 4: Town keys, region names, and slugs

**Files:**
- Create: `server/services/regions/town-key.ts`
- Create: `server/services/regions/slug.ts`
- Create: `server/services/regions/__tests__/town-key.test.ts`
- Create: `server/services/regions/__tests__/slug.test.ts`

**Interfaces:**
- Produces:
  - `normalizeTownKey(city: string | null | undefined, state: string | null | undefined): string | null`, returns `"<city>|<st>"`, e.g. `"turners falls|ma"`
  - `normalizeStateCode(state: string | null | undefined): string | null` (two-letter lowercase)
  - `normalizeRegionName(name: string): string`, a comparison key: lowercase, trim, collapse spaces, strip leading `in `, then leading `the `
  - `cleanRegionName(name: string): string`, the display form: trim, collapse spaces, strip a leading `in ` (case-insensitive)
  - `deriveRegionSlug(name: string, takenSlugs: Set<string>): string`
  - `deriveVenueSlug(baseSlug: string, takenSlugs: Set<string>): string`

- [ ] **Step 1: Write the failing tests**

```ts
// server/services/regions/__tests__/town-key.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeTownKey, normalizeRegionName, cleanRegionName } from '../town-key'

describe('normalizeTownKey', () => {
  it.each([
    ['Northampton', 'MA', 'northampton|ma'],
    ['  Turners   Falls ', 'ma', 'turners falls|ma'],
    ['Northampton, MA', 'MA', 'northampton|ma'],
    ['Northampton MA', 'MA', 'northampton|ma'],
    ['Boston, Massachusetts', 'Massachusetts', 'boston|ma'],
    ['Brattleboro', 'Vermont', 'brattleboro|vt'],
    ['St. Johnsbury', 'VT', 'st. johnsbury|vt'],
    ['Montréal', 'QC', 'montréal|qc'],
  ])('%s, %s -> %s', (city, state, expected) => {
    expect(normalizeTownKey(city, state)).toBe(expected)
  })

  it('leaves a suffix that does not match the state', () => {
    expect(normalizeTownKey('Kansas City MO', 'KS')).toBe('kansas city mo|ks')
  })

  it.each([
    [null, 'MA'], ['Boston', null], ['', 'MA'], ['Boston', 'Narnia'],
  ])('returns null for %s, %s', (city, state) => {
    expect(normalizeTownKey(city, state)).toBeNull()
  })
})

describe('region names', () => {
  it('compares names regardless of in/the/case/spacing', () => {
    expect(normalizeRegionName('in the  Berkshires')).toBe(normalizeRegionName('The Berkshires'))
    expect(normalizeRegionName('North Shore')).toBe(normalizeRegionName('the North Shore'))
  })
  it('cleans a leading "in" for display but keeps "the"', () => {
    expect(cleanRegionName(' in the  Berkshires ')).toBe('the Berkshires')
    expect(cleanRegionName('Western Massachusetts')).toBe('Western Massachusetts')
  })
})
```

```ts
// server/services/regions/__tests__/slug.test.ts
import { describe, it, expect } from 'vitest'
import { deriveRegionSlug, deriveVenueSlug } from '../slug'

describe('deriveRegionSlug', () => {
  it('strips in/the and punctuation', () => {
    expect(deriveRegionSlug('the North Shore', new Set())).toBe('north-shore')
    expect(deriveRegionSlug("in the Martha's Vineyard", new Set())).toBe('marthas-vineyard')
  })
  it('suffixes on collision, -2 then -3', () => {
    expect(deriveRegionSlug('the Berkshires', new Set(['berkshires']))).toBe('berkshires-2')
    expect(deriveRegionSlug('Berkshires', new Set(['berkshires', 'berkshires-2']))).toBe('berkshires-3')
  })
})

describe('deriveVenueSlug', () => {
  it('returns the base slug when free', () => {
    expect(deriveVenueSlug('the-hangar', new Set())).toBe('the-hangar')
  })
  it('suffixes when taken', () => {
    expect(deriveVenueSlug('the-hangar', new Set(['the-hangar', 'the-hangar-2']))).toBe('the-hangar-3')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/services/regions/__tests__/town-key.test.ts server/services/regions/__tests__/slug.test.ts`
Expected: FAIL, modules not found

- [ ] **Step 3: Write the implementation**

```ts
// server/services/regions/town-key.ts
const STATE_NAMES: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca', colorado: 'co',
  connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id',
  illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky', louisiana: 'la',
  maine: 'me', maryland: 'md', massachusetts: 'ma', michigan: 'mi', minnesota: 'mn',
  mississippi: 'ms', missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok', oregon: 'or',
  pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc', 'south dakota': 'sd',
  tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt', virginia: 'va', washington: 'wa',
  'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy', 'district of columbia': 'dc',
  quebec: 'qc', ontario: 'on',
}

function squash(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeStateCode(state: string | null | undefined): string | null {
  if (!state) return null
  const s = squash(state)
  if (/^[a-z]{2}$/.test(s)) return s
  return STATE_NAMES[s] ?? null
}

export function normalizeTownKey(city: string | null | undefined, state: string | null | undefined): string | null {
  const st = normalizeStateCode(state)
  if (!city || !st) return null
  let c = squash(city)
  const stateName = Object.keys(STATE_NAMES).find(n => STATE_NAMES[n] === st)
  const suffixes = [st, ...(stateName ? [stateName] : [])]
  for (const suffix of suffixes) {
    const re = new RegExp(`,?\\s+${suffix.replace(/\s/g, '\\s+')}$`)
    if (re.test(c)) {
      c = c.replace(re, '')
      break
    }
  }
  c = c.replace(/,$/, '').trim()
  return c ? `${c}|${st}` : null
}

export function cleanRegionName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/^in\s+/i, '')
}

export function normalizeRegionName(name: string): string {
  return cleanRegionName(name).toLowerCase().replace(/^the\s+/, '')
}
```

```ts
// server/services/regions/slug.ts
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
  return withSuffix(base || 'region', takenSlugs)
}

export function deriveVenueSlug(baseSlug: string, takenSlugs: Set<string>): string {
  return withSuffix(baseSlug, takenSlugs)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/services/regions/__tests__/town-key.test.ts server/services/regions/__tests__/slug.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/regions/town-key.ts server/services/regions/slug.ts server/services/regions/__tests__/town-key.test.ts server/services/regions/__tests__/slug.test.ts
git commit -m "feat: town key normalization and region/venue slug derivation"
```

### Task 5: Schema migration and removal of DBSCAN

**Files:**
- Modify: `prisma/schema.prisma` (Region model around lines 16-36; add RegionTown model and enum)
- Create: `prisma/migrations/<timestamp>_town_based_regions/migration.sql` (generated)
- Delete: `server/services/clustering/index.ts`, `server/api/cron/cluster-regions.post.ts`, `scripts/delete-auto-regions.ts`, `scripts/test-clustering.ts`
- Modify: `docker/crontab` (delete the disabled cluster-regions line from Task 3)

**Interfaces:**
- Produces: Prisma model `RegionTown` (`prisma.regionTown`) with fields `id, townKey (unique), city, state, regionId, latitude?, longitude?, source (RegionTownSource), createdAt, updatedAt`; enum `RegionTownSource { SEED LLM ADMIN }`; `Region.towns RegionTown[]`; `Region.isAutoGenerated` removed.

- [ ] **Step 1: Edit the schema**

In `model Region`, delete the `isAutoGenerated` line and add `towns RegionTown[]` after `playlists SpotifyPlaylist[]`. Add below the Region model:

```prisma
enum RegionTownSource {
  SEED
  LLM
  ADMIN
}

// Town -> region mapping. Source of truth for region membership.
model RegionTown {
  id        String           @id @default(cuid())
  townKey   String           @unique // normalizeTownKey(city, state), e.g. "turners falls|ma"
  city      String
  state     String
  regionId  String
  latitude  Float?
  longitude Float?
  source    RegionTownSource
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  region Region @relation(fields: [regionId], references: [id])

  @@index([regionId])
  @@map("region_towns")
}
```

- [ ] **Step 2: Delete the DBSCAN code and cron line**

```bash
git rm server/services/clustering/index.ts server/api/cron/cluster-regions.post.ts scripts/delete-auto-regions.ts scripts/test-clustering.ts
```

Remove the disabled `cluster-regions` line and its comment from `docker/crontab`.

- [ ] **Step 3: Generate the migration**

Run: `npx prisma migrate dev --name town_based_regions`
Expected: a new migration folder whose SQL creates the `RegionTownSource` enum and `region_towns` table, with a unique index on `townKey`, an index on `regionId`, a foreign key to regions, and `ALTER TABLE "regions" DROP COLUMN "isAutoGenerated"`. Read the generated SQL and confirm it contains nothing else.

- [ ] **Step 4: Verify nothing references the removed code**

Run: `grep -rn "clustering\|isAutoGenerated\|cluster-regions" server app scripts docker prisma/schema.prisma`
Expected: no matches

Run: `npx nuxi typecheck`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations docker/crontab
git commit -m "feat: add region_towns table, drop DBSCAN clustering"
```

### Task 6: Seed `region_towns` from current assignments

**Files:**
- Create: `server/services/regions/seed.ts`
- Create: `server/services/regions/__tests__/seed.test.ts`
- Create: `scripts/seed-region-towns.ts`

**Interfaces:**
- Consumes: `normalizeTownKey`, `normalizeStateCode` (Task 4); `prisma.regionTown` (Task 5); `HOLDING_REGION_SLUG` (Task 1)
- Produces:
  - `type SeedVenue = { regionId: string; regionCreatedAt: Date }`
  - `pickSeedRegion(venues: SeedVenue[]): { regionId: string; conflict: boolean } | null`. The majority region wins; ties go to the oldest region (earliest `regionCreatedAt`, then lowest id); `conflict` is true when more than one region is present.

- [ ] **Step 1: Write the failing test**

```ts
// server/services/regions/__tests__/seed.test.ts
import { describe, it, expect } from 'vitest'
import { pickSeedRegion } from '../seed'

const old = new Date('2025-01-01')
const newer = new Date('2026-01-01')

describe('pickSeedRegion', () => {
  it('returns null for no venues', () => {
    expect(pickSeedRegion([])).toBeNull()
  })
  it('returns the only region without conflict', () => {
    expect(pickSeedRegion([{ regionId: 'pv', regionCreatedAt: old }])).toEqual({ regionId: 'pv', conflict: false })
  })
  it('picks the majority region and flags conflict', () => {
    const r = pickSeedRegion([
      { regionId: 'bk', regionCreatedAt: newer },
      { regionId: 'pv', regionCreatedAt: old },
      { regionId: 'bk', regionCreatedAt: newer },
    ])
    expect(r).toEqual({ regionId: 'bk', conflict: true })
  })
  it('breaks a tie by the oldest region', () => {
    const r = pickSeedRegion([
      { regionId: 'bk', regionCreatedAt: newer },
      { regionId: 'pv', regionCreatedAt: old },
    ])
    expect(r).toEqual({ regionId: 'pv', conflict: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/regions/__tests__/seed.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Write the implementation**

```ts
// server/services/regions/seed.ts
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
```

```ts
// scripts/seed-region-towns.ts
/**
 * Seed region_towns from current venue -> region assignments.
 * Dry run:  npx tsx scripts/seed-region-towns.ts
 * Write:    npx tsx scripts/seed-region-towns.ts --write
 */
import 'dotenv/config'
import prisma from '../server/utils/prisma'
import { normalizeTownKey, normalizeStateCode } from '../server/services/regions/town-key'
import { pickSeedRegion, type SeedVenue } from '../server/services/regions/seed'
import { HOLDING_REGION_SLUG } from '../server/utils/geo'

async function main() {
  const write = process.argv.includes('--write')
  const venues = await prisma.venue.findMany({
    where: { isActive: true, region: { slug: { not: HOLDING_REGION_SLUG } } },
    select: { name: true, city: true, state: true, latitude: true, longitude: true, regionId: true, region: { select: { name: true, createdAt: true } } },
  })

  const byTown = new Map<string, { city: string; state: string; venues: (SeedVenue & { lat: number | null; lng: number | null; name: string; regionName: string })[] }>()
  const noKey: string[] = []
  for (const v of venues) {
    const key = normalizeTownKey(v.city, v.state)
    if (!key) { noKey.push(`${v.name} (city=${v.city ?? '-'}, state=${v.state ?? '-'})`); continue }
    const entry = byTown.get(key) ?? { city: v.city!.trim(), state: normalizeStateCode(v.state)!.toUpperCase(), venues: [] }
    entry.venues.push({ regionId: v.regionId, regionCreatedAt: v.region.createdAt, lat: v.latitude, lng: v.longitude, name: v.name, regionName: v.region.name })
    byTown.set(key, entry)
  }

  const existing = new Set((await prisma.regionTown.findMany({ select: { townKey: true } })).map(t => t.townKey))
  const rows = []
  for (const [townKey, town] of byTown) {
    if (existing.has(townKey)) continue
    const pick = pickSeedRegion(town.venues)!
    if (pick.conflict) {
      console.log(`CONFLICT ${townKey}: ${town.venues.map(v => `${v.name} -> ${v.regionName}`).join('; ')} => using ${pick.regionId}`)
    }
    const withCoords = town.venues.filter(v => v.lat != null && v.lng != null)
    rows.push({
      townKey,
      city: town.city,
      state: town.state,
      regionId: pick.regionId,
      latitude: withCoords.length ? withCoords.reduce((s, v) => s + v.lat!, 0) / withCoords.length : null,
      longitude: withCoords.length ? withCoords.reduce((s, v) => s + v.lng!, 0) / withCoords.length : null,
      source: 'SEED' as const,
    })
  }

  console.log(`${rows.length} towns to seed, ${existing.size} already mapped, ${noKey.length} venues without a town key:`)
  for (const n of noKey) console.log(`  NO KEY ${n}`)
  for (const r of rows) console.log(`  ${r.townKey} -> ${r.regionId}`)

  if (!write) { console.log('Dry run. Re-run with --write to insert.'); return }
  await prisma.regionTown.createMany({ data: rows, skipDuplicates: true })
  console.log('Inserted.')
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 4: Run test and dry-run the script locally**

Run: `npx vitest run server/services/regions/__tests__/seed.test.ts`
Expected: PASS

Run: `npx tsx scripts/seed-region-towns.ts` against the local dev DB
Expected: a list of towns with region ids, any CONFLICT lines, any NO KEY lines; nothing written

- [ ] **Step 5: Commit**

```bash
git add server/services/regions/seed.ts server/services/regions/__tests__/seed.test.ts scripts/seed-region-towns.ts
git commit -m "feat: seed region_towns from current venue assignments"
```

### Task 7: Prompts and response validation

**Files:**
- Create: `server/services/regions/prompts.ts`
- Create: `server/services/regions/validate.ts`
- Create: `server/services/regions/__tests__/prompts.test.ts`
- Create: `server/services/regions/__tests__/validate.test.ts`
- Modify: `server/services/regions/types.ts` (add types)

**Interfaces:**
- Consumes: `normalizeRegionName`, `cleanRegionName` (Task 4)
- Produces (add to `types.ts`):
  ```ts
  export type TownInput = { townKey: string; city: string; state: string; lat: number; lng: number }
  export type CandidateRegion = { id: string; name: string; distanceMiles: number; towns: string[] }
  export type PartitionRegion = { existingRegionId: string | null; name: string; townKeys: string[] }
  export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] }
  ```
  - `buildAssignPrompt(town: TownInput, candidates: CandidateRegion[]): string`. The response contract is `{"regionId": "<id>"}` or `{"regionId": null}`.
  - `buildPartitionPrompt(towns: TownInput[], nearby: CandidateRegion[], fixed: { townKey: string; regionId: string }[]): string`. The response contract is `{"regions": [{"name": string, "existingRegionId"?: string, "towns": string[]}]}`.
  - `parseJsonObject(raw: string): Validation<Record<string, unknown>>`
  - `validateAssignment(raw: string, offeredIds: string[]): Validation<string | null>` (null means none)
  - `validatePartition(raw: string, requestedKeys: string[], offered: { id: string; name: string }[], fixed?: { townKey: string; regionId: string }[]): Validation<PartitionRegion[]>`

- [ ] **Step 1: Write the failing tests**

```ts
// server/services/regions/__tests__/validate.test.ts
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
```

```ts
// server/services/regions/__tests__/prompts.test.ts
import { describe, it, expect } from 'vitest'
import { buildAssignPrompt, buildPartitionPrompt } from '../prompts'

const town = { townKey: 'beverly|ma', city: 'Beverly', state: 'MA', lat: 42.558, lng: -70.88 }
const region = (id: string, n: number) => ({ id, name: `Region ${id}`, distanceMiles: 10, towns: Array.from({ length: n }, (_, i) => `town${i}|ma`) })

describe('buildAssignPrompt', () => {
  it('includes the town, each candidate id, and the none option', () => {
    const p = buildAssignPrompt(town, [region('a', 3), region('b', 3)])
    expect(p).toContain('beverly|ma')
    expect(p).toContain('"a"')
    expect(p).toContain('"b"')
    expect(p).toContain('"regionId": null')
  })
  it('caps member towns at 25 per region', () => {
    const p = buildAssignPrompt(town, [region('a', 40)])
    expect(p).toContain('town24|ma')
    expect(p).not.toContain('town25|ma')
  })
})

describe('buildPartitionPrompt', () => {
  it('lists every town, nearby regions, fixed towns, and the "in" naming rule', () => {
    const p = buildPartitionPrompt([town, { ...town, townKey: 'salem|ma', city: 'Salem' }], [region('pv', 2)], [{ townKey: 'salem|ma', regionId: 'pv' }])
    expect(p).toContain('beverly|ma')
    expect(p).toContain('salem|ma')
    expect(p).toContain('"pv"')
    expect(p).toMatch(/FIXED/)
    expect(p).toMatch(/after the word "in"/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/services/regions/__tests__/validate.test.ts server/services/regions/__tests__/prompts.test.ts`
Expected: FAIL, modules not found

- [ ] **Step 3: Write the implementation**

Append to `server/services/regions/types.ts`:

```ts
export type TownInput = { townKey: string; city: string; state: string; lat: number; lng: number }
export type CandidateRegion = { id: string; name: string; distanceMiles: number; towns: string[] }
export type PartitionRegion = { existingRegionId: string | null; name: string; townKeys: string[] }
export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] }
```

```ts
// server/services/regions/prompts.ts
import type { CandidateRegion, TownInput } from './types'

const MAX_MEMBER_TOWNS = 25

const GRANULARITY = `A region is the area a local would name when deciding where to go out for a show,
typically 15-30 miles across. Use the most common colloquial name people actually say.
Dense metros may be split (for example the North Shore vs Greater Boston); rural areas may be broader.
Neighborhoods of a city (for example Dorchester, Allston, Jamaica Plain in Boston) belong with that city.`

function describeRegion(r: CandidateRegion): string {
  return `- id "${r.id}": ${r.name} (${r.distanceMiles.toFixed(0)} mi away). Towns: ${r.towns.slice(0, MAX_MEMBER_TOWNS).join(', ') || '(none listed)'}`
}

export function buildAssignPrompt(town: TownInput, candidates: CandidateRegion[]): string {
  return `You assign towns to regions for a local live-music listings site.

${GRANULARITY}

Town: ${town.city}, ${town.state} (key ${town.townKey}, at ${town.lat.toFixed(3)}, ${town.lng.toFixed(3)})

Candidate regions:
${candidates.map(describeRegion).join('\n')}

If the town clearly belongs to one candidate region, answer with its id.
If it does not belong to any of them, answer null. Do not invent a new region.

Respond with only JSON, either {"regionId": "<id>"} or {"regionId": null}.`
}

export function buildPartitionPrompt(towns: TownInput[], nearby: CandidateRegion[], fixed: { townKey: string; regionId: string }[]): string {
  const fixedLines = fixed.map(f => `- ${f.townKey} is FIXED in region id "${f.regionId}"`).join('\n')
  return `You group towns into regions for a local live-music listings site.

${GRANULARITY}

Region names must read naturally after the word "in" on the site, e.g. "the Pioneer Valley",
"the North Shore", "Greater Boston", "Western Massachusetts". Do not start a name with "in".

Existing nearby regions (reuse one by giving its existingRegionId when a town belongs to it):
${nearby.map(describeRegion).join('\n') || '(none)'}

${fixedLines ? `Fixed assignments that must not change:\n${fixedLines}\n` : ''}
Towns to group (key, name, lat, lng):
${towns.map(t => `- ${t.townKey}: ${t.city}, ${t.state} (${t.lat.toFixed(3)}, ${t.lng.toFixed(3)})`).join('\n')}

Every town key above must appear in exactly one region.

Respond with only JSON:
{"regions": [{"name": "<region name>", "existingRegionId": "<id, only when reusing>", "towns": ["<town key>", ...]}]}`
}
```

```ts
// server/services/regions/validate.ts
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
  const merged = new Map<string, PartitionRegion>() // key: existing id or "new:<normalized name>"
  const seen = new Map<string, number>()

  for (const entry of list as Array<Record<string, unknown>>) {
    const towns = Array.isArray(entry?.towns) ? entry.towns.filter((t): t is string => typeof t === 'string') : []
    let existingId = typeof entry?.existingRegionId === 'string' ? entry.existingRegionId : null
    const name = typeof entry?.name === 'string' ? cleanRegionName(entry.name) : ''

    if (existingId && !offeredById.has(existingId)) { errors.push(`unknown existingRegionId ${existingId}`); continue }
    if (!existingId) {
      if (!name) { errors.push('region with empty name'); continue }
      const match = offeredByNorm.get(normalizeRegionName(name))
      if (match) existingId = match.id
    }
    const key = existingId ?? `new:${normalizeRegionName(name)}`
    const target = merged.get(key) ?? {
      existingRegionId: existingId,
      name: existingId ? offeredById.get(existingId)!.name : name,
      townKeys: [],
    }
    for (const t of towns) {
      target.townKeys.push(t)
      seen.set(t, (seen.get(t) ?? 0) + 1)
    }
    merged.set(key, target)
  }

  const requested = new Set(requestedKeys)
  for (const k of requestedKeys) if (!seen.has(k)) errors.push(`town ${k} missing`)
  for (const [k, n] of seen) {
    if (!requested.has(k)) errors.push(`unknown town ${k}`)
    if (n > 1) errors.push(`town ${k} listed ${n} times`)
  }
  for (const f of fixed) {
    const placed = [...merged.values()].find(r => r.townKeys.includes(f.townKey))
    if (placed && placed.existingRegionId !== f.regionId) errors.push(`fixed town ${f.townKey} moved`)
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: [...merged.values()].filter(r => r.townKeys.length > 0) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/services/regions/__tests__/validate.test.ts server/services/regions/__tests__/prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/regions/types.ts server/services/regions/prompts.ts server/services/regions/validate.ts server/services/regions/__tests__/prompts.test.ts server/services/regions/__tests__/validate.test.ts
git commit -m "feat: region assignment and partition prompts with strict response validation"
```

### Task 8: Town-based `resolveRegionForVenue`

**Files:**
- Modify: `server/services/regions/store.ts` (extend interface and Prisma implementation)
- Modify: `server/services/regions/resolve.ts` (replace the interim logic)
- Modify: `server/services/regions/__tests__/resolve.test.ts` (replace the interim tests)
- Modify: callers from Task 2 (pass `llm`)

**Interfaces:**
- Consumes: `normalizeTownKey` (Task 4); `buildAssignPrompt`, `validateAssignment` (Task 7); `selectCandidateRegions` (Task 1)
- Produces:
  ```ts
  export type NewTownRow = { townKey: string; city: string; state: string; regionId: string; latitude: number | null; longitude: number | null; source: 'SEED' | 'LLM' | 'ADMIN' }
  export interface RegionStore {
    findTown(townKey: string): Promise<{ regionId: string } | null>
    insertTown(row: NewTownRow): Promise<void>            // throws an error with code 'P2002' on duplicate townKey
    listRegionsWithCentroids(): Promise<RegionSummary[]>  // now includes up to 25 member town keys
    getHoldingRegionId(): Promise<string>
    recomputeRegionStats(regionIds: string[]): Promise<void> // isActive = has an active venue; centroid = mean of active venue coords; holding region stays active
  }
  export type LlmClient = { complete(opts: { provider: 'anthropic'; model: string; messages: { role: 'user'; content: string }[]; temperature: number; maxTokens: number }): Promise<{ content: string }> }
  export type ResolveDeps = { store: RegionStore; llm: LlmClient }
  ```
  `resolveRegionForVenue(deps, venue): Promise<ResolveResult>`, with `via` set to `'mapped' | 'llm' | 'holding'`

- [ ] **Step 1: Replace the tests**

```ts
// server/services/regions/__tests__/resolve.test.ts
import { describe, it, expect } from 'vitest'
import { resolveRegionForVenue, type LlmClient } from '../resolve'
import type { NewTownRow, RegionStore } from '../store'
import type { RegionSummary } from '../types'

const ns: RegionSummary = { id: 'ns', name: 'the North Shore', centroidLat: 42.52, centroidLng: -70.9, towns: ['salem|ma'] }
const beverly = { city: 'Beverly', state: 'MA', latitude: 42.558, longitude: -70.88 }

function setup(opts: { towns?: Record<string, string>; regions?: RegionSummary[]; llmReply?: string | Error; insertConflictWith?: string } = {}) {
  const towns = new Map(Object.entries(opts.towns ?? {}))
  const inserted: NewTownRow[] = []
  const llmCalls: string[] = []
  const store: RegionStore = {
    findTown: async k => (towns.has(k) ? { regionId: towns.get(k)! } : null),
    insertTown: async row => {
      if (opts.insertConflictWith) {
        towns.set(row.townKey, opts.insertConflictWith)
        throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
      }
      inserted.push(row)
      towns.set(row.townKey, row.regionId)
    },
    listRegionsWithCentroids: async () => opts.regions ?? [ns],
    getHoldingRegionId: async () => 'holding',
    recomputeRegionStats: async () => {},
  }
  const llm: LlmClient = {
    complete: async ({ messages }) => {
      llmCalls.push(messages[0]!.content)
      if (opts.llmReply instanceof Error) throw opts.llmReply
      return { content: opts.llmReply ?? '{"regionId":"ns"}' }
    },
  }
  return { deps: { store, llm }, inserted, llmCalls }
}

describe('resolveRegionForVenue', () => {
  it('uses a stored mapping without calling the LLM', async () => {
    const { deps, llmCalls } = setup({ towns: { 'beverly|ma': 'ns' } })
    expect(await resolveRegionForVenue(deps, beverly)).toEqual({ regionId: 'ns', via: 'mapped' })
    expect(llmCalls).toHaveLength(0)
  })

  it('asks the LLM for an unmapped town and persists the answer', async () => {
    const { deps, inserted } = setup()
    expect(await resolveRegionForVenue(deps, beverly)).toEqual({ regionId: 'ns', via: 'llm' })
    expect(inserted).toEqual([{ townKey: 'beverly|ma', city: 'Beverly', state: 'MA', regionId: 'ns', latitude: 42.558, longitude: -70.88, source: 'LLM' }])
  })

  it.each([
    ['the LLM answers none', { llmReply: '{"regionId":null}' }],
    ['the LLM throws', { llmReply: new Error('timeout') }],
    ['the LLM returns invalid JSON', { llmReply: 'I think North Shore' }],
    ['the LLM picks an id it was not offered', { llmReply: '{"regionId":"pv"}' }],
    ['no region is within 60 miles', { regions: [{ ...ns, centroidLat: 44.5, centroidLng: -73.2 }] }],
  ])('falls back to holding and persists nothing when %s', async (_label, opts) => {
    const { deps, inserted } = setup(opts)
    expect(await resolveRegionForVenue(deps, beverly)).toEqual({ regionId: 'holding', via: 'holding' })
    expect(inserted).toHaveLength(0)
  })

  it('falls back to holding for a venue with no city or no coordinates', async () => {
    const { deps, llmCalls } = setup()
    expect((await resolveRegionForVenue(deps, { state: 'MA', latitude: 42.5, longitude: -70.9 })).via).toBe('holding')
    expect((await resolveRegionForVenue(deps, { city: 'Beverly', state: 'MA' })).via).toBe('holding')
    expect(llmCalls).toHaveLength(0)
  })

  it('re-reads the stored row when a concurrent insert wins the unique townKey', async () => {
    const { deps } = setup({ insertConflictWith: 'ns-from-other-request' })
    expect(await resolveRegionForVenue(deps, beverly)).toEqual({ regionId: 'ns-from-other-request', via: 'mapped' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/services/regions/__tests__/resolve.test.ts`
Expected: FAIL (`LlmClient` not exported; interim behavior differs)

- [ ] **Step 3: Write the implementation**

Replace `server/services/regions/store.ts`:

```ts
import type { PrismaClient } from '@prisma/client'
import { HOLDING_REGION_SLUG } from '../../utils/geo'
import type { RegionSummary } from './types'

export type NewTownRow = { townKey: string; city: string; state: string; regionId: string; latitude: number | null; longitude: number | null; source: 'SEED' | 'LLM' | 'ADMIN' }

export interface RegionStore {
  findTown(townKey: string): Promise<{ regionId: string } | null>
  insertTown(row: NewTownRow): Promise<void>
  listRegionsWithCentroids(): Promise<RegionSummary[]>
  getHoldingRegionId(): Promise<string>
  recomputeRegionStats(regionIds: string[]): Promise<void>
}

export function createPrismaRegionStore(prisma: PrismaClient): RegionStore {
  return {
    async findTown(townKey) {
      return prisma.regionTown.findUnique({ where: { townKey }, select: { regionId: true } })
    },
    async insertTown(row) {
      await prisma.regionTown.create({ data: row })
    },
    async listRegionsWithCentroids() {
      const regions = await prisma.region.findMany({
        where: { isActive: true, slug: { not: HOLDING_REGION_SLUG }, centroidLat: { not: null }, centroidLng: { not: null } },
        select: { id: true, name: true, centroidLat: true, centroidLng: true, towns: { select: { townKey: true }, take: 25, orderBy: { createdAt: 'asc' } } },
      })
      return regions.map(r => ({ id: r.id, name: r.name, centroidLat: r.centroidLat!, centroidLng: r.centroidLng!, towns: r.towns.map(t => t.townKey) }))
    },
    async getHoldingRegionId() {
      const region = await prisma.region.upsert({
        where: { slug: HOLDING_REGION_SLUG },
        update: {},
        create: { name: 'Other', slug: HOLDING_REGION_SLUG, isActive: true },
        select: { id: true },
      })
      return region.id
    },
    async recomputeRegionStats(regionIds) {
      for (const id of new Set(regionIds)) {
        const region = await prisma.region.findUnique({ where: { id }, select: { slug: true } })
        if (!region) continue
        const agg = await prisma.venue.aggregate({
          where: { regionId: id, isActive: true, latitude: { not: null }, longitude: { not: null } },
          _avg: { latitude: true, longitude: true },
        })
        const activeCount = await prisma.venue.count({ where: { regionId: id, isActive: true } })
        await prisma.region.update({
          where: { id },
          data: {
            centroidLat: agg._avg.latitude,
            centroidLng: agg._avg.longitude,
            isActive: region.slug === HOLDING_REGION_SLUG ? true : activeCount > 0,
          },
        })
      }
    },
  }
}
```

Replace `server/services/regions/resolve.ts`:

```ts
import { selectCandidateRegions } from '../../utils/geo'
import { buildAssignPrompt } from './prompts'
import type { RegionStore } from './store'
import { normalizeStateCode, normalizeTownKey } from './town-key'
import type { ResolveResult, VenueLocation } from './types'
import { validateAssignment } from './validate'

export type LlmClient = {
  complete(opts: {
    provider: 'anthropic'
    model: string
    messages: { role: 'user'; content: string }[]
    temperature: number
    maxTokens: number
  }): Promise<{ content: string }>
}

export type ResolveDeps = { store: RegionStore; llm: LlmClient }

export const ASSIGN_MODEL = 'claude-haiku-4-5-20251001'

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

/**
 * Region for a venue: stored town mapping, else an LLM pick among nearby
 * existing regions (persisted), else the holding region (nothing persisted).
 * Never call inside a Prisma transaction: it may make a network call.
 */
export async function resolveRegionForVenue(deps: ResolveDeps, venue: VenueLocation): Promise<ResolveResult> {
  const { store, llm } = deps
  const townKey = normalizeTownKey(venue.city, venue.state)
  const holding = async (): Promise<ResolveResult> => ({ regionId: await store.getHoldingRegionId(), via: 'holding' })

  if (!townKey) return holding()

  const mapped = await store.findTown(townKey)
  if (mapped) return { regionId: mapped.regionId, via: 'mapped' }

  if (venue.latitude == null || venue.longitude == null) return holding()

  const candidates = selectCandidateRegions(await store.listRegionsWithCentroids(), venue.latitude, venue.longitude)
  if (candidates.length === 0) return holding()

  const town = { townKey, city: venue.city!.trim(), state: normalizeStateCode(venue.state)!.toUpperCase(), lat: venue.latitude, lng: venue.longitude }
  let regionId: string | null
  try {
    const response = await llm.complete({
      provider: 'anthropic',
      model: ASSIGN_MODEL,
      messages: [{ role: 'user', content: buildAssignPrompt(town, candidates) }],
      temperature: 0,
      maxTokens: 100,
    })
    const result = validateAssignment(response.content, candidates.map(c => c.id))
    if (!result.ok) {
      console.warn(`[Regions] Invalid assignment for ${townKey}: ${result.errors.join('; ')}`)
      return holding()
    }
    regionId = result.value
  } catch (e) {
    console.warn(`[Regions] Assignment failed for ${townKey}:`, e)
    return holding()
  }
  if (!regionId) return holding()

  try {
    await store.insertTown({ townKey, city: town.city, state: town.state, regionId, latitude: town.lat, longitude: town.lng, source: 'LLM' })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const winner = await store.findTown(townKey)
    if (winner) return { regionId: winner.regionId, via: 'mapped' }
    throw e
  }
  return { regionId, via: 'llm' }
}
```

Update the three callers from Task 2 to pass the LLM client. Import `llmService` from the `services/llm` path relative to each file, and change `{ store: createPrismaRegionStore(prisma) }` to `{ store: createPrismaRegionStore(prisma), llm: llmService }`. In `approve.post.ts` and `create-venue.post.ts`, after the venue is created, add:

```ts
await createPrismaRegionStore(prisma).recomputeRegionStats([regionId])
```

In `approve.post.ts` this call goes after the transaction, using `resolvedRegionId`. In `create-venue.post.ts` it goes after `prisma.venue.create`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run server/services/regions && npx nuxi typecheck`
Expected: PASS, clean. If `llmService.complete`'s parameter type is not assignable to `LlmClient`, the typecheck reports it at the caller. `LLMCompletionOptions` in `server/services/llm/types.ts` is a superset, so it should be assignable.

- [ ] **Step 5: Commit**

```bash
git add server/services/regions server/api/agent/create-venue.post.ts server/api/agent/approve.post.ts server/api/events/submit.post.ts
git commit -m "feat: resolve venue regions from region_towns with LLM assignment to existing regions"
```

### Task 9: Partition planning and script

**Files:**
- Create: `server/services/regions/partition-plan.ts`
- Create: `server/services/regions/__tests__/partition-plan.test.ts`
- Create: `scripts/partition-regions.ts`

**Interfaces:**
- Consumes: `PartitionRegion`, `TownInput` (Task 7); `deriveRegionSlug`, `deriveVenueSlug` (Task 4); `buildPartitionPrompt`, `validatePartition` (Task 7); `selectCandidateRegions` (Task 1); `geocodeAddress` from `server/services/geocoding.ts`; `HOLDING_REGION_SLUG`
- Produces:
  ```ts
  export type RegionRef = { existingId: string } | { newIndex: number }
  export type PartitionPlanInput = {
    proposal: PartitionRegion[]
    towns: Map<string, TownInput>
    adminTownKeys: Set<string>
    venues: { id: string; slug: string; regionId: string; townKey: string }[]
    venueSlugsByRegion: Map<string, Set<string>>
    takenRegionSlugs: Set<string>
  }
  export type PartitionPlan = {
    newRegions: { name: string; slug: string }[]
    townUpserts: { townKey: string; city: string; state: string; lat: number; lng: number; region: RegionRef }[]
    venueMoves: { venueId: string; fromRegionId: string; region: RegionRef; newSlug: string | null }[]
  }
  export function planPartitionWrite(input: PartitionPlanInput): PartitionPlan
  ```

- [ ] **Step 1: Write the failing test**

```ts
// server/services/regions/__tests__/partition-plan.test.ts
import { describe, it, expect } from 'vitest'
import { planPartitionWrite, type PartitionPlanInput } from '../partition-plan'

const t = (townKey: string) => [townKey, { townKey, city: townKey.split('|')[0]!, state: 'MA', lat: 42.5, lng: -70.9 }] as const

function input(over: Partial<PartitionPlanInput> = {}): PartitionPlanInput {
  return {
    proposal: [
      { existingRegionId: null, name: 'the North Shore', townKeys: ['salem|ma', 'beverly|ma'] },
      { existingRegionId: 'pv', name: 'the Pioneer Valley', townKeys: ['easthampton|ma'] },
    ],
    towns: new Map([t('salem|ma'), t('beverly|ma'), t('easthampton|ma')]),
    adminTownKeys: new Set(),
    venues: [
      { id: 'v1', slug: 'the-hangar', regionId: 'holding', townKey: 'salem|ma' },
      { id: 'v2', slug: 'gulu-gulu', regionId: 'holding', townKey: 'salem|ma' },
      { id: 'v3', slug: 'the-hangar', regionId: 'holding', townKey: 'beverly|ma' },
      { id: 'v4', slug: 'cafe', regionId: 'pv', townKey: 'easthampton|ma' },
    ],
    venueSlugsByRegion: new Map([['pv', new Set(['cafe'])], ['holding', new Set(['the-hangar', 'gulu-gulu'])]]),
    takenRegionSlugs: new Set(['pioneer-valley', 'other']),
    ...over,
  }
}

describe('planPartitionWrite', () => {
  it('creates new regions with derived slugs', () => {
    expect(planPartitionWrite(input()).newRegions).toEqual([{ name: 'the North Shore', slug: 'north-shore' }])
  })

  it('upserts every proposed town with its region ref', () => {
    const plan = planPartitionWrite(input())
    expect(plan.townUpserts.map(u => [u.townKey, u.region])).toEqual([
      ['salem|ma', { newIndex: 0 }], ['beverly|ma', { newIndex: 0 }], ['easthampton|ma', { existingId: 'pv' }],
    ])
  })

  it('moves holding-region venues and leaves venues already in place alone', () => {
    const plan = planPartitionWrite(input())
    expect(plan.venueMoves.map(m => m.venueId)).toEqual(['v1', 'v2', 'v3'])
  })

  it('suffixes an incoming venue slug that collides in the target region', () => {
    const plan = planPartitionWrite(input())
    expect(plan.venueMoves.find(m => m.venueId === 'v1')!.newSlug).toBeNull()
    expect(plan.venueMoves.find(m => m.venueId === 'v3')!.newSlug).toBe('the-hangar-2')
  })

  it('suffixes against venues already in an existing target region', () => {
    const plan = planPartitionWrite(input({
      venues: [{ id: 'v9', slug: 'cafe', regionId: 'holding', townKey: 'easthampton|ma' }],
    }))
    expect(plan.venueMoves).toEqual([{ venueId: 'v9', fromRegionId: 'holding', region: { existingId: 'pv' }, newSlug: 'cafe-2' }])
  })

  it('never touches ADMIN towns or their venues', () => {
    const plan = planPartitionWrite(input({ adminTownKeys: new Set(['beverly|ma']) }))
    expect(plan.townUpserts.map(u => u.townKey)).not.toContain('beverly|ma')
    expect(plan.venueMoves.map(m => m.venueId)).not.toContain('v3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/regions/__tests__/partition-plan.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Write the implementation**

```ts
// server/services/regions/partition-plan.ts
import { deriveRegionSlug, deriveVenueSlug } from './slug'
import type { PartitionRegion, TownInput } from './types'

export type RegionRef = { existingId: string } | { newIndex: number }

export type PartitionPlanInput = {
  proposal: PartitionRegion[]
  towns: Map<string, TownInput>
  adminTownKeys: Set<string>
  venues: { id: string; slug: string; regionId: string; townKey: string }[]
  venueSlugsByRegion: Map<string, Set<string>>
  takenRegionSlugs: Set<string>
}

export type PartitionPlan = {
  newRegions: { name: string; slug: string }[]
  townUpserts: { townKey: string; city: string; state: string; lat: number; lng: number; region: RegionRef }[]
  venueMoves: { venueId: string; fromRegionId: string; region: RegionRef; newSlug: string | null }[]
}

function refKey(ref: RegionRef): string {
  return 'existingId' in ref ? ref.existingId : `new:${ref.newIndex}`
}

export function planPartitionWrite(input: PartitionPlanInput): PartitionPlan {
  const takenRegionSlugs = new Set(input.takenRegionSlugs)
  const newRegions: PartitionPlan['newRegions'] = []
  const townRef = new Map<string, RegionRef>()

  for (const region of input.proposal) {
    let ref: RegionRef
    if (region.existingRegionId) {
      ref = { existingId: region.existingRegionId }
    } else {
      const slug = deriveRegionSlug(region.name, takenRegionSlugs)
      takenRegionSlugs.add(slug)
      ref = { newIndex: newRegions.length }
      newRegions.push({ name: region.name, slug })
    }
    for (const k of region.townKeys) if (!input.adminTownKeys.has(k)) townRef.set(k, ref)
  }

  const townUpserts: PartitionPlan['townUpserts'] = []
  for (const [townKey, region] of townRef) {
    const town = input.towns.get(townKey)
    if (!town) continue
    townUpserts.push({ townKey, city: town.city, state: town.state, lat: town.lat, lng: town.lng, region })
  }

  const slugsByTarget = new Map<string, Set<string>>()
  const slugsFor = (ref: RegionRef) => {
    const k = refKey(ref)
    if (!slugsByTarget.has(k)) {
      slugsByTarget.set(k, new Set('existingId' in ref ? input.venueSlugsByRegion.get(ref.existingId) ?? [] : []))
    }
    return slugsByTarget.get(k)!
  }

  const venueMoves: PartitionPlan['venueMoves'] = []
  for (const venue of input.venues) {
    const ref = townRef.get(venue.townKey)
    if (!ref) continue
    if ('existingId' in ref && ref.existingId === venue.regionId) continue
    const taken = slugsFor(ref)
    const slug = deriveVenueSlug(venue.slug, taken)
    taken.add(slug)
    venueMoves.push({ venueId: venue.id, fromRegionId: venue.regionId, region: ref, newSlug: slug === venue.slug ? null : slug })
  }

  return { newRegions, townUpserts, venueMoves }
}
```

```ts
// scripts/partition-regions.ts
/**
 * Propose and write region partitions for new areas.
 *
 * Input JSON: array of { city, state?, lat?, lng?, name? } (survey files and feed venue lists both fit).
 *   npx tsx scripts/partition-regions.ts --input docs/research/eastern-ma/survey-north-shore.json --default-state MA
 *   npx tsx scripts/partition-regions.ts --from proposal.json --write
 *   add --recut to re-partition towns that are already mapped (ADMIN rows stay fixed)
 *   add --include-holding to also partition towns of venues currently in the holding region
 *
 * Without --write it prints a review and saves proposal.json for editing.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import prisma from '../server/utils/prisma'
import { llmService } from '../server/services/llm'
import { geocodeAddress } from '../server/services/geocoding'
import { HOLDING_REGION_SLUG, haversineDistance, selectCandidateRegions } from '../server/utils/geo'
import { normalizeStateCode, normalizeTownKey } from '../server/services/regions/town-key'
import { buildPartitionPrompt } from '../server/services/regions/prompts'
import { validatePartition } from '../server/services/regions/validate'
import { planPartitionWrite } from '../server/services/regions/partition-plan'
import { createPrismaRegionStore } from '../server/services/regions/store'
import type { CandidateRegion, PartitionRegion, TownInput } from '../server/services/regions/types'

const PARTITION_MODEL = 'claude-sonnet-5-5'
const BATCH = 150

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (name: string) => process.argv.includes(name)

async function loadTowns(): Promise<Map<string, TownInput>> {
  const towns = new Map<string, TownInput>()
  const defaultState = arg('--default-state')
  const rows: Array<{ city?: string; state?: string; lat?: number; lng?: number }> = arg('--input') ? JSON.parse(readFileSync(arg('--input')!, 'utf8')) : []
  if (flag('--include-holding')) {
    const held = await prisma.venue.findMany({ where: { isActive: true, region: { slug: HOLDING_REGION_SLUG } }, select: { city: true, state: true, latitude: true, longitude: true } })
    rows.push(...held.map(v => ({ city: v.city ?? undefined, state: v.state ?? undefined, lat: v.latitude ?? undefined, lng: v.longitude ?? undefined })))
  }
  const coords = new Map<string, { lat: number; lng: number }[]>()
  for (const r of rows) {
    const key = normalizeTownKey(r.city, r.state ?? defaultState)
    if (!key) continue
    if (!towns.has(key)) towns.set(key, { townKey: key, city: r.city!.trim(), state: normalizeStateCode(r.state ?? defaultState)!.toUpperCase(), lat: NaN, lng: NaN })
    if (r.lat != null && r.lng != null) coords.set(key, [...(coords.get(key) ?? []), { lat: r.lat, lng: r.lng }])
  }
  for (const town of towns.values()) {
    const pts = coords.get(town.townKey)
    if (pts?.length) {
      town.lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
      town.lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length
    } else {
      const g = await geocodeAddress(`${town.city}, ${town.state}`)
      if (!g) { console.warn(`Could not geocode ${town.townKey}; skipping`); towns.delete(town.townKey); continue }
      town.lat = g.lat
      town.lng = g.lng
    }
  }
  return towns
}

async function propose(towns: Map<string, TownInput>): Promise<PartitionRegion[]> {
  const mapped = await prisma.regionTown.findMany({ select: { townKey: true, regionId: true, source: true } })
  const mappedKeys = new Map(mapped.map(m => [m.townKey, m]))
  const recut = flag('--recut')
  const input = [...towns.values()].filter(t => {
    const m = mappedKeys.get(t.townKey)
    return !m || (recut && m.source !== 'ADMIN')
  })
  const fixed = recut ? mapped.filter(m => m.source === 'ADMIN' && towns.has(m.townKey)).map(m => ({ townKey: m.townKey, regionId: m.regionId })) : []
  if (input.length === 0) { console.log('No unmapped towns in input.'); return [] }

  const regions = await createPrismaRegionStore(prisma).listRegionsWithCentroids()
  const all: PartitionRegion[] = []
  // Batches are geographic: sort west-to-east so each batch is contiguous.
  input.sort((a, b) => a.lng - b.lng)
  for (let i = 0; i < input.length; i += BATCH) {
    const batch = input.slice(i, i + BATCH)
    const nearbyMap = new Map<string, CandidateRegion>()
    for (const t of batch) {
      for (const c of selectCandidateRegions(regions, t.lat, t.lng, { maxMiles: 60, limit: 5 })) {
        const prev = nearbyMap.get(c.id)
        if (!prev || c.distanceMiles < prev.distanceMiles) nearbyMap.set(c.id, { id: c.id, name: c.name, distanceMiles: c.distanceMiles, towns: c.towns })
      }
    }
    const nearby = [...nearbyMap.values()]
    const batchFixed = fixed.filter(f => batch.some(t => t.townKey === f.townKey))
    const response = await llmService.complete({
      provider: 'anthropic',
      model: PARTITION_MODEL,
      messages: [{ role: 'user', content: buildPartitionPrompt(batch, nearby, batchFixed) }],
      temperature: 0,
      maxTokens: 8000,
    })
    const result = validatePartition(response.content, batch.map(t => t.townKey), nearby, batchFixed)
    if (!result.ok) {
      console.error(`Batch ${i / BATCH + 1} invalid:\n  ${result.errors.join('\n  ')}`)
      process.exit(1)
    }
    all.push(...result.value)
  }
  return all
}

async function review(proposal: PartitionRegion[], towns: Map<string, TownInput>) {
  const plan = await buildPlan(proposal, towns)
  for (const region of proposal) {
    const pts = region.townKeys.map(k => towns.get(k)).filter((t): t is TownInput => !!t)
    const cLat = pts.reduce((s, t) => s + t.lat, 0) / pts.length
    const cLng = pts.reduce((s, t) => s + t.lng, 0) / pts.length
    const far = [...pts].sort((a, b) => haversineDistance(b.lat, b.lng, cLat, cLng) - haversineDistance(a.lat, a.lng, cLat, cLng)).slice(0, 3)
    const label = region.existingRegionId ? `${region.name} (existing)` : `${region.name} (NEW)`
    console.log(`\n${label}: ${pts.length} towns`)
    console.log(`  towns: ${region.townKeys.join(', ')}`)
    console.log(`  farthest from center: ${far.map(t => `${t.townKey} (${haversineDistance(t.lat, t.lng, cLat, cLng).toFixed(0)} mi)`).join(', ')}`)
  }
  console.log(`\n${plan.venueMoves.length} venues would move; slug changes:`)
  for (const m of plan.venueMoves.filter(m => m.newSlug)) console.log(`  venue ${m.venueId} -> ${m.newSlug}`)
}

async function buildPlan(proposal: PartitionRegion[], towns: Map<string, TownInput>) {
  const keys = proposal.flatMap(r => r.townKeys)
  const venues = (await prisma.venue.findMany({ where: { isActive: true }, select: { id: true, slug: true, regionId: true, city: true, state: true } }))
    .map(v => ({ id: v.id, slug: v.slug, regionId: v.regionId, townKey: normalizeTownKey(v.city, v.state) ?? '' }))
    .filter(v => keys.includes(v.townKey))
  const allVenues = await prisma.venue.findMany({ select: { slug: true, regionId: true } })
  const venueSlugsByRegion = new Map<string, Set<string>>()
  for (const v of allVenues) venueSlugsByRegion.set(v.regionId, (venueSlugsByRegion.get(v.regionId) ?? new Set()).add(v.slug))
  const admin = await prisma.regionTown.findMany({ where: { source: 'ADMIN' }, select: { townKey: true } })
  const regions = await prisma.region.findMany({ select: { slug: true } })
  return planPartitionWrite({
    proposal,
    towns,
    adminTownKeys: new Set(admin.map(a => a.townKey)),
    venues,
    venueSlugsByRegion,
    takenRegionSlugs: new Set(regions.map(r => r.slug)),
  })
}

async function write(proposal: PartitionRegion[], towns: Map<string, TownInput>) {
  const plan = await buildPlan(proposal, towns)
  const touched = await prisma.$transaction(async (tx) => {
    const created = []
    for (const r of plan.newRegions) created.push(await tx.region.create({ data: { name: r.name, slug: r.slug, isActive: true }, select: { id: true } }))
    const idOf = (ref: { existingId: string } | { newIndex: number }) => ('existingId' in ref ? ref.existingId : created[ref.newIndex]!.id)
    for (const u of plan.townUpserts) {
      const regionId = idOf(u.region)
      await tx.regionTown.upsert({
        where: { townKey: u.townKey },
        update: { regionId, source: 'LLM' },
        create: { townKey: u.townKey, city: u.city, state: u.state, regionId, latitude: u.lat, longitude: u.lng, source: 'LLM' },
      })
    }
    const touchedIds = new Set<string>()
    for (const m of plan.venueMoves) {
      const regionId = idOf(m.region)
      await tx.venue.update({ where: { id: m.venueId }, data: { regionId, ...(m.newSlug ? { slug: m.newSlug } : {}) } })
      await tx.event.updateMany({ where: { venueId: m.venueId }, data: { regionId } })
      touchedIds.add(regionId)
      touchedIds.add(m.fromRegionId)
    }
    for (const c of created) touchedIds.add(c.id)
    return [...touchedIds]
  })
  await createPrismaRegionStore(prisma).recomputeRegionStats(touched)
  console.log(`Wrote ${plan.newRegions.length} new regions, ${plan.townUpserts.length} towns, ${plan.venueMoves.length} venue moves.`)
}

async function main() {
  const towns = await loadTowns()
  let proposal: PartitionRegion[]
  if (arg('--from')) {
    proposal = JSON.parse(readFileSync(arg('--from')!, 'utf8'))
    for (const k of proposal.flatMap(r => r.townKeys)) {
      if (towns.has(k)) continue
      const row = await prisma.regionTown.findUnique({ where: { townKey: k } })
      const [city, st] = k.split('|')
      const g = row?.latitude != null ? { lat: row.latitude, lng: row.longitude! } : await geocodeAddress(`${city}, ${st}`)
      if (g) towns.set(k, { townKey: k, city: row?.city ?? city!, state: st!.toUpperCase(), lat: g.lat, lng: g.lng })
    }
  } else {
    proposal = await propose(towns)
    writeFileSync('proposal.json', JSON.stringify(proposal, null, 2))
    console.log('Saved proposal.json')
  }
  await review(proposal, towns)
  if (flag('--write')) await write(proposal, towns)
  else console.log('\nDry run. Edit proposal.json if needed, then: npx tsx scripts/partition-regions.ts --from proposal.json --write')
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 4: Run test, typecheck, and dry-run locally**

Run: `npx vitest run server/services/regions/__tests__/partition-plan.test.ts && npx nuxi typecheck`
Expected: PASS, clean (`scripts/` is outside the Nuxt typecheck. Also run `npx tsc --noEmit --module esnext --moduleResolution bundler --target es2022 --skipLibCheck scripts/partition-regions.ts` and expect no errors.)

Run (local DB, after `npx tsx scripts/seed-region-towns.ts --write`): `npx tsx scripts/partition-regions.ts --input docs/research/eastern-ma/survey-north-shore.json --default-state MA`
Expected: a printed review of proposed regions with farthest-town lines; `proposal.json` saved; nothing written to the DB

- [ ] **Step 5: Commit**

```bash
git add server/services/regions/partition-plan.ts server/services/regions/__tests__/partition-plan.test.ts scripts/partition-regions.ts
git commit -m "feat: operator-reviewed region partition script"
```

Add `proposal.json` to `.gitignore` in the same commit.

### Task 10: Weekly regions maintenance job

**Files:**
- Create: `server/services/regions/maintenance.ts`
- Create: `server/services/regions/__tests__/maintenance.test.ts`
- Create: `server/api/cron/regions-maintenance.post.ts`
- Modify: `docker/crontab` (add a line in place of the old cluster-regions line)

**Interfaces:**
- Consumes: `resolveRegionForVenue`, `ResolveDeps` (Task 8); `deriveVenueSlug` (Task 4)
- Produces:
  ```ts
  export type MaintenanceVenue = { id: string; name: string; slug: string; city: string | null; state: string | null; latitude: number | null; longitude: number | null }
  export type MaintenanceIO = {
    listHoldingVenues(): Promise<MaintenanceVenue[]>
    venueSlugsInRegion(regionId: string): Promise<Set<string>>
    moveVenue(venueId: string, regionId: string, newSlug: string | null): Promise<void> // also moves events
    allRegionIds(): Promise<string[]>
  }
  export type MaintenanceReport = { moved: { venue: string; regionId: string }[]; stillHolding: { venue: string; townKey: string | null }[] }
  export async function runRegionMaintenance(deps: ResolveDeps & { io: MaintenanceIO }): Promise<MaintenanceReport>
  export function formatMaintenanceReport(r: MaintenanceReport): string
  ```

- [ ] **Step 1: Write the failing test**

```ts
// server/services/regions/__tests__/maintenance.test.ts
import { describe, it, expect } from 'vitest'
import { runRegionMaintenance, formatMaintenanceReport, type MaintenanceIO } from '../maintenance'
import type { RegionStore } from '../store'

function deps(towns: Record<string, string>, slugsInTarget: string[] = []) {
  const moves: Array<[string, string, string | null]> = []
  const recomputed: string[][] = []
  const store: RegionStore = {
    findTown: async k => (towns[k] ? { regionId: towns[k]! } : null),
    insertTown: async () => {},
    listRegionsWithCentroids: async () => [],
    getHoldingRegionId: async () => 'holding',
    recomputeRegionStats: async ids => { recomputed.push(ids) },
  }
  const io: MaintenanceIO = {
    listHoldingVenues: async () => [
      { id: 'v1', name: 'Gulu-Gulu', slug: 'gulu-gulu', city: 'Salem', state: 'MA', latitude: 42.52, longitude: -70.89 },
      { id: 'v2', name: 'Mystery Bar', slug: 'mystery-bar', city: 'Nowhere', state: 'MA', latitude: 42, longitude: -71 },
    ],
    venueSlugsInRegion: async () => new Set(slugsInTarget),
    moveVenue: async (id, regionId, newSlug) => { moves.push([id, regionId, newSlug]) },
    allRegionIds: async () => ['ns', 'holding'],
  }
  return { d: { store, io, llm: { complete: async () => ({ content: '{"regionId":null}' }) } }, moves, recomputed }
}

describe('runRegionMaintenance', () => {
  it('moves holding venues whose town is now mapped and reports the rest', async () => {
    const { d, moves, recomputed } = deps({ 'salem|ma': 'ns' })
    const report = await runRegionMaintenance(d)
    expect(moves).toEqual([['v1', 'ns', null]])
    expect(report.moved).toEqual([{ venue: 'Gulu-Gulu', regionId: 'ns' }])
    expect(report.stillHolding).toEqual([{ venue: 'Mystery Bar', townKey: 'nowhere|ma' }])
    expect(recomputed).toEqual([['ns', 'holding']])
  })

  it('suffixes the slug when the target region already has it', async () => {
    const { d, moves } = deps({ 'salem|ma': 'ns' }, ['gulu-gulu'])
    await runRegionMaintenance(d)
    expect(moves[0]).toEqual(['v1', 'ns', 'gulu-gulu-2'])
  })

  it('formats a readable Slack summary', () => {
    const text = formatMaintenanceReport({ moved: [{ venue: 'A', regionId: 'ns' }], stillHolding: [{ venue: 'B', townKey: 'x|ma' }] })
    expect(text).toContain('Moved 1')
    expect(text).toContain('B (x|ma)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/regions/__tests__/maintenance.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Write the implementation**

```ts
// server/services/regions/maintenance.ts
import { resolveRegionForVenue, type ResolveDeps } from './resolve'
import { deriveVenueSlug } from './slug'
import { normalizeTownKey } from './town-key'

export type MaintenanceVenue = { id: string; name: string; slug: string; city: string | null; state: string | null; latitude: number | null; longitude: number | null }
export type MaintenanceIO = {
  listHoldingVenues(): Promise<MaintenanceVenue[]>
  venueSlugsInRegion(regionId: string): Promise<Set<string>>
  moveVenue(venueId: string, regionId: string, newSlug: string | null): Promise<void>
  allRegionIds(): Promise<string[]>
}
export type MaintenanceReport = { moved: { venue: string; regionId: string }[]; stillHolding: { venue: string; townKey: string | null }[] }

/** Weekly: place holding-region venues whose towns can now be assigned, then refresh region stats. Never creates regions. */
export async function runRegionMaintenance(deps: ResolveDeps & { io: MaintenanceIO }): Promise<MaintenanceReport> {
  const { io } = deps
  const report: MaintenanceReport = { moved: [], stillHolding: [] }
  for (const venue of await io.listHoldingVenues()) {
    const result = await resolveRegionForVenue(deps, venue)
    if (result.via === 'holding') {
      report.stillHolding.push({ venue: venue.name, townKey: normalizeTownKey(venue.city, venue.state) })
      continue
    }
    const taken = await io.venueSlugsInRegion(result.regionId)
    const slug = deriveVenueSlug(venue.slug, taken)
    await io.moveVenue(venue.id, result.regionId, slug === venue.slug ? null : slug)
    report.moved.push({ venue: venue.name, regionId: result.regionId })
  }
  await deps.store.recomputeRegionStats(await io.allRegionIds())
  return report
}

export function formatMaintenanceReport(r: MaintenanceReport): string {
  const lines = [`Regions maintenance: Moved ${r.moved.length} venues out of the holding region.`]
  if (r.stillHolding.length) {
    lines.push(`${r.stillHolding.length} venues still need a partition run:`)
    for (const h of r.stillHolding) lines.push(`• ${h.venue} (${h.townKey ?? 'no town key'})`)
  }
  return lines.join('\n')
}
```

```ts
// server/api/cron/regions-maintenance.post.ts
/**
 * Weekly region maintenance. POST /api/cron/regions-maintenance?token=$CRON_SECRET
 */
import prisma from '../../utils/prisma'
import { verifyCronAuth } from '../../utils/cron-auth'
import { llmService } from '../../services/llm'
import { sendSlackNotification } from '../../services/notifications'
import { createPrismaRegionStore } from '../../services/regions/store'
import { runRegionMaintenance, formatMaintenanceReport } from '../../services/regions/maintenance'
import { HOLDING_REGION_SLUG } from '../../utils/geo'

export default defineEventHandler(async (event) => {
  verifyCronAuth(event)
  const report = await runRegionMaintenance({
    store: createPrismaRegionStore(prisma),
    llm: llmService,
    io: {
      listHoldingVenues: () => prisma.venue.findMany({
        where: { isActive: true, region: { slug: HOLDING_REGION_SLUG } },
        select: { id: true, name: true, slug: true, city: true, state: true, latitude: true, longitude: true },
      }),
      venueSlugsInRegion: async regionId => new Set((await prisma.venue.findMany({ where: { regionId }, select: { slug: true } })).map(v => v.slug)),
      moveVenue: async (venueId, regionId, newSlug) => {
        await prisma.$transaction([
          prisma.venue.update({ where: { id: venueId }, data: { regionId, ...(newSlug ? { slug: newSlug } : {}) } }),
          prisma.event.updateMany({ where: { venueId }, data: { regionId } }),
        ])
      },
      allRegionIds: async () => (await prisma.region.findMany({ select: { id: true } })).map(r => r.id),
    },
  })
  if (report.moved.length || report.stillHolding.length) {
    await sendSlackNotification(formatMaintenanceReport(report))
  }
  return { success: true, ...report }
})
```

In `docker/crontab`, add:

```
# Weekly region maintenance (Mondays 3am)
0 3 * * 1 curl -sX POST "http://app:3000/api/cron/regions-maintenance?token=$CRON_SECRET" >> /var/log/cron.log 2>&1
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run server/services/regions && npx nuxi typecheck`
Expected: PASS, clean

- [ ] **Step 5: Commit**

```bash
git add server/services/regions/maintenance.ts server/services/regions/__tests__/maintenance.test.ts server/api/cron/regions-maintenance.post.ts docker/crontab
git commit -m "feat: weekly regions maintenance job"
```

### Task 11: Admin regions page with town reassignment

**Files:**
- Create: `server/services/regions/reassign-plan.ts`
- Create: `server/services/regions/__tests__/reassign-plan.test.ts`
- Create: `server/api/admin/regions/index.get.ts`
- Create: `server/api/admin/region-towns/[id].patch.ts`
- Create: `app/pages/admin/regions.vue`

**Interfaces:**
- Consumes: `prisma.regionTown` (Task 5), `normalizeTownKey` (Task 4), `createPrismaRegionStore().recomputeRegionStats` (Task 8)
- Produces:
  - `planTownReassign(input: { venues: { id: string; name: string; slug: string }[]; targetSlugs: Set<string> }): { ok: true } | { ok: false; conflicts: string[] }`. The spec requires refusing on collision and naming the conflicting venue.
  - `GET /api/admin/regions` returns `{ regions: Array<{ id, name, slug, isActive, venueCount, towns: Array<{ id, townKey, city, state, source }> }> }`
  - `PATCH /api/admin/region-towns/:id` takes body `{ regionId: string }` and returns `{ success: true, movedVenues: number }`, or a 409 with `{ message }` listing conflicts

- [ ] **Step 1: Write the failing test**

```ts
// server/services/regions/__tests__/reassign-plan.test.ts
import { describe, it, expect } from 'vitest'
import { planTownReassign } from '../reassign-plan'

describe('planTownReassign', () => {
  it('allows a move with no slug collisions', () => {
    expect(planTownReassign({ venues: [{ id: 'v1', name: 'Gulu-Gulu', slug: 'gulu-gulu' }], targetSlugs: new Set(['other']) })).toEqual({ ok: true })
  })
  it('refuses and names each colliding venue', () => {
    const r = planTownReassign({
      venues: [{ id: 'v1', name: 'The Hangar', slug: 'the-hangar' }, { id: 'v2', name: 'Cafe', slug: 'cafe' }],
      targetSlugs: new Set(['the-hangar']),
    })
    expect(r).toEqual({ ok: false, conflicts: ['The Hangar (the-hangar)'] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/regions/__tests__/reassign-plan.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Write the implementation**

```ts
// server/services/regions/reassign-plan.ts
export function planTownReassign(input: { venues: { id: string; name: string; slug: string }[]; targetSlugs: Set<string> }):
  { ok: true } | { ok: false; conflicts: string[] } {
  const conflicts = input.venues.filter(v => input.targetSlugs.has(v.slug)).map(v => `${v.name} (${v.slug})`)
  return conflicts.length ? { ok: false, conflicts } : { ok: true }
}
```

```ts
// server/api/admin/regions/index.get.ts
import prisma from '../../../utils/prisma'

export default defineEventHandler(async () => {
  const regions = await prisma.region.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, slug: true, isActive: true,
      _count: { select: { venues: { where: { isActive: true } } } },
      towns: { orderBy: { townKey: 'asc' }, select: { id: true, townKey: true, city: true, state: true, source: true } },
    },
  })
  return {
    regions: regions.map(r => ({ id: r.id, name: r.name, slug: r.slug, isActive: r.isActive, venueCount: r._count.venues, towns: r.towns })),
  }
})
```

```ts
// server/api/admin/region-towns/[id].patch.ts
import prisma from '../../../utils/prisma'
import { normalizeTownKey } from '../../../services/regions/town-key'
import { planTownReassign } from '../../../services/regions/reassign-plan'
import { createPrismaRegionStore } from '../../../services/regions/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { regionId } = await readBody<{ regionId?: string }>(event)
  if (!regionId) throw createError({ statusCode: 400, message: 'regionId is required' })

  const town = await prisma.regionTown.findUnique({ where: { id } })
  if (!town) throw createError({ statusCode: 404, message: 'Town not found' })
  const target = await prisma.region.findUnique({ where: { id: regionId }, select: { id: true } })
  if (!target) throw createError({ statusCode: 400, message: 'Unknown region' })

  const candidates = await prisma.venue.findMany({ select: { id: true, name: true, slug: true, city: true, state: true, regionId: true } })
  const venues = candidates.filter(v => normalizeTownKey(v.city, v.state) === town.townKey && v.regionId !== regionId)
  const targetSlugs = new Set(candidates.filter(v => v.regionId === regionId).map(v => v.slug))
  const plan = planTownReassign({ venues, targetSlugs })
  if (!plan.ok) {
    throw createError({ statusCode: 409, message: `Slug already used in target region by: ${plan.conflicts.join(', ')}. Rename one venue first.` })
  }

  const venueIds = venues.map(v => v.id)
  await prisma.$transaction([
    prisma.regionTown.update({ where: { id }, data: { regionId, source: 'ADMIN' } }),
    prisma.venue.updateMany({ where: { id: { in: venueIds } }, data: { regionId } }),
    prisma.event.updateMany({ where: { venueId: { in: venueIds } }, data: { regionId } }),
  ])
  await createPrismaRegionStore(prisma).recomputeRegionStats([town.regionId, regionId])
  return { success: true, movedVenues: venueIds.length }
})
```

`/api/admin/*` is already restricted to ADMIN/MODERATOR by `server/middleware/auth.ts`.

```vue
<!-- app/pages/admin/regions.vue -->
<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

type Town = { id: string; townKey: string; city: string; state: string; source: 'SEED' | 'LLM' | 'ADMIN' }
type Region = { id: string; name: string; slug: string; isActive: boolean; venueCount: number; towns: Town[] }

const toast = useToast()
const { data, refresh } = await useFetch<{ regions: Region[] }>('/api/admin/regions')
const regions = computed(() => data.value?.regions ?? [])
const regionItems = computed(() => regions.value.map(r => ({ label: r.name, value: r.id })))
const savingId = ref<string | null>(null)

async function reassign(town: Town, regionId: string) {
  savingId.value = town.id
  try {
    const res = await $fetch<{ movedVenues: number }>(`/api/admin/region-towns/${town.id}`, { method: 'PATCH', body: { regionId } })
    toast.add({ title: `Moved ${town.city}`, description: `${res.movedVenues} venues moved`, color: 'success' })
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Could not move town', description: error.data?.message || 'Unknown error', color: 'error' })
    await refresh()
  } finally {
    savingId.value = null
  }
}

useSeoMeta({ title: 'Admin - Regions' })
</script>

<template>
  <div class="px-4 py-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">
      Regions
    </h1>
    <div class="space-y-4">
      <UCard
        v-for="region in regions"
        :key="region.id"
      >
        <template #header>
          <div class="flex items-center gap-2">
            <span class="font-semibold">{{ region.name }}</span>
            <span class="text-sm text-gray-500">{{ region.slug }}</span>
            <UBadge
              :color="region.isActive ? 'success' : 'neutral'"
              variant="soft"
              size="sm"
            >
              {{ region.isActive ? 'active' : 'inactive' }}
            </UBadge>
            <span class="ml-auto text-sm text-gray-500">{{ region.venueCount }} venues, {{ region.towns.length }} towns</span>
          </div>
        </template>
        <p
          v-if="!region.towns.length"
          class="text-sm text-gray-500"
        >
          No towns mapped.
        </p>
        <ul class="divide-y divide-gray-100">
          <li
            v-for="town in region.towns"
            :key="town.id"
            class="flex items-center gap-3 py-2"
          >
            <span class="flex-1">{{ town.city }}, {{ town.state }}</span>
            <span class="text-xs text-gray-400">{{ town.source }}</span>
            <USelect
              :model-value="region.id"
              :items="regionItems"
              :disabled="savingId === town.id"
              size="sm"
              class="w-56"
              @update:model-value="(id: string) => id !== region.id && reassign(town, id)"
            />
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
```

Add a link to `/admin/regions` wherever the other admin pages are linked. Run `grep -rn "admin/venue-claims" app` to find the admin nav.

- [ ] **Step 4: Run tests, typecheck, and check manually**

Run: `npx vitest run server/services/regions && npx nuxi typecheck`
Expected: PASS, clean

Manual: `npm run dev`, log in as admin, open `/admin/regions`, and move a seeded town to another region. Confirm the toast, that the town now shows source ADMIN under the new region, and that its venues moved (check `/admin/venues`). Then create a slug collision in the local DB and confirm the 409 toast names the venue.

- [ ] **Step 5: Commit**

```bash
git add server/services/regions/reassign-plan.ts server/services/regions/__tests__/reassign-plan.test.ts server/api/admin/regions server/api/admin/region-towns app/pages/admin/regions.vue
git commit -m "feat: admin regions page with town reassignment"
```

### Task 12: Prod rollout runbook

**Files:**
- Create: `docs/runbooks/town-based-regions-rollout.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Town-based regions rollout

1. Phase 1 deployed. Andrew runs `scripts/sql/2026-10-06-region-cleanup.sql` (commands in its header).
2. Phase 2 deployed (migration runs on deploy).
3. Seed: `ssh deploy@138.197.34.3 "docker exec aroundhere-app npx tsx scripts/seed-region-towns.ts"`, review CONFLICT and NO KEY lines, then re-run with `--write`.
   Note: the seed's recompute (first maintenance run or first partition write) re-activates the Connecticut regions, because they have active venues. Confirm that is wanted before seeding; if not, set those venues inactive first.
4. Holding-region venues already in prod (Groton Hill and two others): `npx tsx scripts/partition-regions.ts --include-holding --default-state MA` (dry run), review, then `--from proposal.json --write`.
5. Before each Eastern MA wave: run the partition dry run with that wave's survey file plus the feed's venue list, review, and write. Then turn on the wave's sources.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/town-based-regions-rollout.md
git commit -m "docs: town-based regions rollout runbook"
```
