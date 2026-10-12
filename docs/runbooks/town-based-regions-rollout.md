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

First run this read-only pre-check, which lists per region the counts of venues, events, users and playlists, so you can see what the cleanup will keep and delete:
```bash
ssh deploy@138.197.34.3 "docker exec aroundhere-db psql -U postgres -d local_music -c \"SELECT r.slug, r.name, (SELECT count(*) FROM venues v WHERE v.\\\"regionId\\\" = r.id) AS venues, (SELECT count(*) FROM events e WHERE e.\\\"regionId\\\" = r.id) AS events, (SELECT count(*) FROM users u WHERE u.\\\"regionId\\\" = r.id) AS users, (SELECT count(*) FROM spotify_playlists p WHERE p.\\\"regionId\\\" = r.id) AS playlists FROM regions r ORDER BY r.slug;\""
```

Then Andrew runs the cleanup SQL using the command in its header: `scripts/sql/2026-10-06-region-cleanup.sql`.

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

Note: the first weekly regions-maintenance run recomputes every region and re-activates the Connecticut regions, because they have active venues. A partition write only recomputes the regions it touches, so it does not. (Verified against a restored prod dump on 2026-10-11.) Confirm that is wanted before seeding; if not, set those venues inactive first.

Note: Dry run and write should happen in one sitting. A redeploy recreates the container and discards the seed output.

## Step 4: Holding-region venues in prod

Partition the holding-region venues that already exist in prod (Groton Hill and two others). This step runs on the production server.

Run the partition dry run on the server:
```bash
ssh deploy@138.197.34.3 "docker exec aroundhere-app npx tsx scripts/partition-regions.ts --include-holding --default-state MA"
```

This generates `proposal.json` (inside the container at `/app/proposal.json`) containing `{ "regions": [...], "towns": [...] }`. Review the printed output:
- Regions and the towns assigned to each
- Farthest towns from the center of each region
- New region slugs (marked with `(NEW, slug ...)`)
- Venue slug changes (listed as `venue <id>: <old> -> <new>`)
- Any name collisions (existing regions with the same name as proposed new regions)

To edit the proposal, copy it from the container, edit it locally, and copy it back:
```bash
ssh deploy@138.197.34.3 "docker cp aroundhere-app:/app/proposal.json /tmp/proposal.json"
# Edit /tmp/proposal.json
ssh deploy@138.197.34.3 "docker cp /tmp/proposal.json aroundhere-app:/app/proposal.json"
```

Then run the write:
```bash
ssh deploy@138.197.34.3 "docker exec aroundhere-app npx tsx scripts/partition-regions.ts --from proposal.json --write --default-state MA"
```

The write will refuse if a proposed new region name collides with an existing region name.

Note: A redeploy recreates the container and discards `proposal.json`, so the dry run and write should happen in one sitting.

## Step 5: Eastern MA waves

Before each Eastern MA wave, prepare a merged JSON file containing the wave's survey file and the feed's venue list (both as arrays of `{ city, state?, lat?, lng? }` objects combined into a single array).

Copy the merged input file to the production server:
```bash
scp <merged-file> deploy@138.197.34.3:/tmp/
ssh deploy@138.197.34.3 "docker cp /tmp/<merged-file> aroundhere-app:/app/<merged-file>"
```

Run the partition dry run on the server:
```bash
ssh deploy@138.197.34.3 "docker exec aroundhere-app npx tsx scripts/partition-regions.ts --input <merged-file> --default-state MA"
```

This generates `proposal.json` (inside the container at `/app/proposal.json`). Review the printed output and copy it locally to edit if needed:
```bash
ssh deploy@138.197.34.3 "docker cp aroundhere-app:/app/proposal.json /tmp/proposal.json"
# Edit /tmp/proposal.json
ssh deploy@138.197.34.3 "docker cp /tmp/proposal.json aroundhere-app:/app/proposal.json"
```

Then run the write:
```bash
ssh deploy@138.197.34.3 "docker exec aroundhere-app npx tsx scripts/partition-regions.ts --from proposal.json --write --default-state MA"
```

Once the partition write is complete, turn on that wave's event sources.

Note: A redeploy recreates the container and discards files in `/app/`, so the dry run and write should happen in one sitting.

## Weekly job

The `regions-maintenance` cron runs every Monday at 3am. It moves holding-region venues whose towns can now be assigned to their proper regions. It posts a Slack summary when venues moved, when venues remain in the holding region, or when failures occur. The summary lists moved venues and any venues still needing a partition run.
