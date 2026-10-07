# Town-Based Regions

**Date:** 2026-10-06
**Status:** Draft v3 (v1 reviewed by architecture, devil's-advocate, tests; v2 re-reviewed by devil's-advocate)

## Problem

Regions are produced weekly by `POST /api/cron/cluster-regions`, which runs DBSCAN (15 mi epsilon, 35 mi max radius) over active venues and asks an LLM to name each cluster. The name becomes the slug, and the slug is the region's identity. Three defects follow.

1. **Identity churn.** A different LLM name on a later run produces a new slug, so a new region is created and the old one is deactivated. Prod has 9 dead regions (seven New Haven / Hartford spellings, plus "the Berkshires" vs "in the Berkshires"). Two of three Spotify playlists now point at inactive, venue-less regions and sync zero events.
2. **Geometric, not cultural, boundaries.** In dense areas DBSCAN chains (Worcester to Boston to Salem is a continuous 15 mi chain). `enforceMaxRadius` ejects outliers and `assignOrphans` re-absorbs them into the same cluster, so dense metros become one blob with unstable edges.
3. **New venues are misfiled until cron runs.** `create-venue.post.ts` assigns the oldest active region; `approve.post.ts` substring-matches the state name against region names, then falls back to the first active region; `events/submit.post.ts` uses nearest centroid. A Boston venue would appear in the Pioneer Valley for up to a week.

### Where regions matter

Browsing is map-based; the header's "in {region}" label follows the map via `/api/regions/nearest` and is unaffected by this work beyond better names. Regions carry weight in three places: **Spotify playlists** (`playlist-sync.ts` filters by `regionId`), **user primary region** (settings, set at signup in `auth/verify.get.ts`), and **recommendations** (filter by user `regionId`). Cultural boundaries matter because a user in Salem should get a "North Shore" playlist and recommendations, not "Greater Boston from Worcester to Gloucester".

## Goals

- Region names reflect how locals describe where they go out (cultural lines), discovered automatically. The operator does not need to know names in advance but reviews them before they go live in a new area.
- A region's id, name and slug never change unless an admin changes them.
- A venue lands in its final region at creation time and does not move afterwards except by admin action.
- Existing Pioneer Valley and Berkshires assignments are unchanged by the migration.

## Non-goals

- Region hierarchy, region merge UI, region rename UI (rename is a one-line SQL update of `name`; slug stays).
- Canonical town identity from TIGER boundaries (tables are present but empty).
- Per-region timezone derivation.
- Any change to map browsing or the header label logic.

## Design

### Phasing

**Phase 1, immediate fixes (independent, small):**
- `resolveRegionForVenue` with only the holding-region fallback (below), wired into `create-venue`, `approve`, and `submit`, replacing the three ad hoc heuristics. Until Phase 2 ships, venues outside existing regions go to the holding region instead of being misfiled in the Pioneer Valley.
- Cleanup SQL: repoint the two broken playlists (see Migration and cleanup, step 3).
- Disable the weekly `cluster-regions` crontab line so churn stops now.

**Phase 2, town-based regions** (the rest of this spec), required before Eastern MA venues go in.

### Core idea

Region membership is a property of the **town**. A persisted table maps each `(city, state)` to a region. Region *proposals* for a new area are made by an LLM over a whole batch of towns at once, reviewed by the operator, then persisted. After that, individual new towns are assigned by the LLM to an existing region, or left unassigned if none fits. DBSCAN is removed.

This is effectively the static-seed approach with the LLM drafting the seed: the operator reviews a proposed town list once per area rather than writing it from scratch, which matters because the operator does not know the regional names in advance.

### Holding region

Venues whose town has no region yet are assigned to the existing `other` region (slug `other`), which is excluded from region pickers, nearest-region lookup, playlists, and the header label. They still appear on the map. The partition script and weekly job move them out. This replaces "nearest active region" as the fallback everywhere, so a Boston venue is never filed under the Pioneer Valley.

### Data model

New table `region_towns`:

| column | type | notes |
|---|---|---|
| id | cuid | |
| townKey | text, unique | `normalizeTownKey(city, state)`, e.g. `turners falls|ma` |
| city | text | display form as first seen |
| state | text | two-letter |
| regionId | fk regions | |
| latitude, longitude | float | mean of venues when first classified; not updated afterwards |
| source | enum `SEED`, `LLM`, `ADMIN` | provenance |
| createdAt, updatedAt | timestamps | |

`regions` is unchanged except: a region is active iff it has at least one active venue. `isAutoGenerated` is dropped in this migration (only DBSCAN used it).

`normalizeTownKey`: trim, lowercase, collapse whitespace, strip a trailing `, MA` / ` MA` / `, Massachusetts` from city when it matches the state field, map full state names to two-letter codes. Missing city or state means no key.

Villages and neighborhoods (Florence, Turners Falls, Allston, Dorchester) get their own rows. Consistency among them comes from batch classification, below.

### Assignment service

`server/services/regions/` with pure functions separated from I/O:

- `normalizeTownKey(city, state)`, pure.
- `buildPartitionPrompt(towns, nearbyRegions)` and `buildAssignPrompt(town, nearbyRegions)`, pure.
- `validatePartition(raw, requestedKeys, offeredRegions)` and `validateAssignment(raw, offeredRegionIds)`, pure; return a typed result or a list of errors.
- `pickSeedRegion(venuesInTown)`, pure (majority region; tie broken by oldest region).
- `resolveRegionForVenue(deps, venue) → regionId`, where `deps = { prisma, llm = llmService }`:
  1. Town key mapped: return it.
  2. Unmapped: offer the 5 nearest regions whose centroid is within 60 mi (`buildAssignPrompt`). The LLM answers with one of their ids or `none`. A valid id is persisted with `source = LLM` and returned. `none` falls through to step 3 and persists nothing, so a town that fits no nearby region is never forced into one.
  3. Otherwise (no key, no candidate regions, `none`, or LLM/validation failure): return the holding region, **persist nothing**. The venue is listed in the next weekly Slack summary as needing a partition run.

`resolveRegionForVenue` is called **before** any `$transaction` in `approve.post.ts`, so no DB transaction is held across a network call. The venue slug uniqueness check inside the transaction uses the resolved region id.

Whenever a venue is assigned to a region (here, the partition write, admin reassign), that region's `isActive` and centroid are recomputed in the same write, so a newly populated region is immediately visible to nearest-region lookup.

All three nearest-region loops (`find-nearest-region.ts`, `auth/verify.get.ts`, `regions/nearest.get.ts`) and the `haversineDistance` copies are consolidated into `findNearestRegion`.

`submit.post.ts` uses `resolveRegionForVenue` when the submission has a city and state; otherwise keeps its coordinate-based nearest-region path.

### Partition script (new areas)

`scripts/partition-regions.ts --input <towns.json> [--recut] [--write]`:

1. Load the towns (from survey JSON, an aggregator feed's venue list, or unmapped prod venues), normalize keys, and drop already-mapped ones. With `--recut`, mapped towns in the input are kept and re-partitioned, except rows with `source = ADMIN`, which are fixed and passed to the LLM as constraints. This is how a regional boundary is re-cut after a later wave adds towns.
2. One LLM call (batches of up to 150 towns; larger inputs split by geography) with `buildPartitionPrompt`: every town with coordinates, every existing region within 60 mi of any input town with up to 25 member towns, and granularity guidance (a region is what a local names when deciding where to go out for a show, typically 15-30 mi across; prefer the most common colloquial name; Boston proper neighborhoods belong with Boston).
3. Output contract: strict JSON `{ "regions": [{ "name": "...", "existingRegionId"?: "...", "towns": ["<townKey>", ...] }] }`. Every requested town appears exactly once.
4. Validate (`validatePartition`): all towns covered once, existing ids among those offered, new names non-empty and not case-insensitively equal to an existing region name (if equal, treated as that existing region).
5. Without `--write`: print a one-page review: each proposed region with town count, venue count, and its three towns farthest from the region centroid (the likeliest misfits), plus any venue slug collisions the write would cause. This is the operator review step. Edit the JSON output by hand if needed and re-run with `--from <edited.json> --write`.
6. With `--write`: create new regions (slug derived once from name, `the ` stripped, numeric suffix on collision), upsert `region_towns` rows with `source = LLM`, move matching venues (including those in the holding region) and their events, and recompute `isActive` and centroids, in a single transaction. Venue slug collisions in the target region are resolved by suffixing the incoming venue's slug (`-2`, `-3`) and listed in the output; venue URLs of existing venues never change.

This replaces the weekly job as the only way new regions are created.

### Weekly job

`POST /api/cron/cluster-regions` is replaced by a slimmer `regions-maintenance` run (new route, crontab updated):

1. For active venues whose town key is unmapped, try `resolveRegionForVenue` step 2 again (existing-only assignment). Venues that resolve are moved to the mapped region along with their events.
2. Recompute region `isActive` (at least one active venue) and centroids.
3. Slack summary: towns assigned, venues still needing a partition run (grouped by state and nearest region), regions activated or deactivated.

It never creates, renames, or deletes regions.

### Admin

A section in the admin area listing regions with their towns and venue counts, with one action: **reassign a town** to another region. This sets `source = ADMIN` and moves the town's venues and their events immediately. If a moved venue's slug already exists in the target region (`@@unique([regionId, slug])`), the reassign is refused with the conflicting venue named; the operator resolves it manually. Users and playlists are not moved.

### Migration and cleanup

1. Prisma migration: create `region_towns`, drop `regions.isAutoGenerated`. Delete `server/api/cron/cluster-regions.post.ts`, `scripts/delete-auto-regions.ts`, and `server/services/clustering/` in the same change (they are the only users of the column).
2. Seed script: for every active venue with a town key, `pickSeedRegion` over that town's venues, insert with `source = SEED`. Conflicts (a town whose venues span regions) and venues with no key are printed for review. This reproduces today's assignments.
3. Cleanup SQL (a validated file that Andrew runs): repoint the Berkshires and New Haven playlists to the matching active region or null; deactivate regions with zero venues.

### Eastern MA rollout

1. Phase 1 and Phase 2 shipped; seed applied.
2. Collect towns from the four survey files **and** from the venue list of every multi-venue feed planned for the wave (bostonshows.org publishes coordinates for its ~200 venues). `partition-regions.ts` dry run; operator reviews and edits.
3. `--write`; then turn on feeds and create venues. Partition-before-import is the rule: a feed's venues should resolve through stored mappings. Any that do not land in the holding region and show up in the weekly summary, so a missed town is visible rather than misfiled.

## Error handling

- LLM failure or invalid response in `resolveRegionForVenue`: nearest active region, nothing persisted, surfaced in the weekly summary.
- Invalid partition output: script exits non-zero and prints validation errors; nothing written.
- Concurrent insert of the same town key: catch Prisma `P2002`, re-read the stored row, use it.
- Fresh DB with no regions: venues go to the holding region until a partition run.

## Testing

The repo has pure-function vitest tests only (no test DB, no `vi.mock` usage under `server/`). This design keeps logic in pure functions so it can be tested the same way; I/O wrappers stay thin.

- `normalizeTownKey`: case, whitespace, `Boston, MA` with state `MA`, `Boston, Massachusetts`, `Northampton MA` without comma, suffix not matching state (left alone), `St. Johnsbury`, accented names, missing city or state.
- `validatePartition`: town missing, town listed twice, unknown existing id, empty or whitespace name, new name equal to an existing name after trim and case-fold, two proposed regions with the same name, fenced or prose-wrapped JSON (strip fences, reject prose), extra keys ignored.
- `validateAssignment`: unknown region id, id not among the offered candidates, `none`, `new` proposal rejected, malformed JSON.
- `buildPartitionPrompt` / `buildAssignPrompt`: structural assertions only (all towns present, 60 mi window, 5-candidate cap, 25-town cap, ADMIN rows passed as fixed constraints under `--recut`). No prompt snapshots.
- Partition write planning as a pure function (`planPartitionWrite(current, proposal)` returns region creates, town upserts, venue moves, slug renames): holding-region venues moved, ADMIN rows untouched under `--recut`, incoming slug suffixed on collision while the existing venue keeps its slug.
- `pickSeedRegion`: single region, majority, tie, empty.
- Slug derivation: `the ` strip, collision suffix `-2` then `-3`, name vs slug collision ("The Berkshires" vs "Berkshires").
- `resolveRegionForVenue` with a fake `{ prisma, llm }`: mapped town makes no LLM call; unmapped with nearby region persists the LLM answer; `none`, LLM throws, missing city, or invalid JSON returns the holding region and persists nothing; `P2002` on insert re-reads.
- Manual: partition dry run on Eastern MA towns, reviewed before `--write`; seed output reviewed before applying to prod.

## Risks

- **Granularity inconsistency** between areas partitioned at different times. Mitigated by including nearby existing regions in every prompt and by operator review of each partition.
- **Single-town assignments drift** toward the largest nearby region. Acceptable for a label; admin reassign corrects it.
- **Messy city strings** create extra rows, not wrong assignments.
- **Venues waiting on a partition run** sit in the holding region (on the map, but absent from region-scoped playlists and recommendations) until the operator acts; the weekly summary keeps that list visible.
- **Operator workload** per wave: one dry run review, occasional JSON edits, and the weekly summary. The one-page review output is meant to keep this to minutes.
