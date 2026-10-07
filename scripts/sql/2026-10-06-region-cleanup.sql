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
