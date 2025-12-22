-- Remove unused notification preference columns
-- These were added but never implemented

ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyFavoriteVenues";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyFavoriteGenres";
