-- Add region to users for filtering recommendations
ALTER TABLE "users" ADD COLUMN "regionId" TEXT;

-- Add foreign key constraint
ALTER TABLE "users" ADD CONSTRAINT "users_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for efficient lookups
CREATE INDEX "users_regionId_idx" ON "users"("regionId");

-- Drop deprecated spotifyAudioFeatures column (was deprecated by Spotify Nov 2024)
ALTER TABLE "artists" DROP COLUMN IF EXISTS "spotifyAudioFeatures";
