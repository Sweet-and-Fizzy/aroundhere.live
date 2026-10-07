# Town-based regions rollout

## Before deploying

Run locally with a real database to validate the changes before production rollout.

1. `npm run db:migrate` to apply `prisma/migrations/20261006_town_based_regions`
2. `npx vitest run` to run all tests
3. `npm run dev` to start the development server
4. Smoke-test the admin agent venue creation flow: create a venue with a Boston address (should land in region "Other") and a Northampton address (should land in region "Pioneer Valley")
5. Open `/admin/regions` and confirm the regions page works
6. Open `/settings` and confirm "Other" is no longer listed as an available region

## Step 1: Phase 1 deployed

Andrew runs the cleanup SQL using the command in its header: `scripts/sql/2026-10-06-region-cleanup.sql`.

The SQL header documents the ssh command to pipe the file; the scp line in the header is unnecessary.

Critical: the cleanup SQL must run BEFORE any Phase 2 partition write, because its DELETE removes every region nothing references. A freshly partitioned region with no venues would be deleted if cleanup ran after partition writes.

## Step 2: Phase 2 deployed

Phase 2 deployment runs the migration automatically on deploy.

## Step 3: Seed region towns

Run the seed script on production:
```bash
ssh deploy@138.197.34.3 "docker exec aroundhere-app npx tsx scripts/seed-region-towns.ts"
```

Review the output for CONFLICT and NO KEY lines. Then re-run with `--write`:
```bash
ssh deploy@138.197.34.3 "docker exec aroundhere-app npx tsx scripts/seed-region-towns.ts --write"
```

Note: the seed's recompute (first maintenance run or first partition write) re-activates the Connecticut regions, because they have active venues. Confirm that is wanted before seeding; if not, set those venues inactive first.

## Step 4: Holding-region venues in prod

Partition the holding-region venues that already exist in prod (Groton Hill and two others).

Run the partition dry run:
```bash
npx tsx scripts/partition-regions.ts --include-holding --default-state MA
```

This generates a `proposal.json` file containing `{ "regions": [...], "towns": [...] }`. Review the printed output:
- Regions and the towns assigned to each
- Farthest towns from the center of each region
- New region slugs (marked with `(NEW, slug ...)`)
- Venue slug changes (listed as `venue <id>: <old> -> <new>`)
- Any name collisions (existing regions with the same name as proposed new regions)

Edit `proposal.json` if needed, then run the write:
```bash
npx tsx scripts/partition-regions.ts --from proposal.json --write
```

The write will refuse if a proposed new region name collides with an existing region name.

## Step 5: Eastern MA waves

Before each Eastern MA wave, run the partition dry run with that wave's survey file plus the venue feed list:
```bash
npx tsx scripts/partition-regions.ts --input <file> --default-state MA
```

Review the proposal and edit `proposal.json` as needed. Then write:
```bash
npx tsx scripts/partition-regions.ts --from proposal.json --write
```

Once the partition write is complete, turn on that wave's event sources.

## Weekly job

The `regions-maintenance` cron runs every Monday at 3am. It moves holding-region venues whose towns can now be assigned to their proper regions, and posts a Slack summary listing any venues still needing a partition run and any failures encountered.
