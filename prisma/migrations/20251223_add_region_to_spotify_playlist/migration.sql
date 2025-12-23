-- Add foreign key constraint and index for regionId on spotify_playlists
-- The regionId column already exists, we just need to add the relation

-- Add index on regionId for faster lookups
CREATE INDEX IF NOT EXISTS "spotify_playlists_regionId_idx" ON "spotify_playlists"("regionId");

-- Add foreign key constraint (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'spotify_playlists_regionId_fkey'
    AND table_name = 'spotify_playlists'
  ) THEN
    ALTER TABLE "spotify_playlists"
    ADD CONSTRAINT "spotify_playlists_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
