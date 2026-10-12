-- Bring the database in line with schema.prisma. These schema changes landed
-- without migrations (d11d312, 110b326), and spotifyAudioFeatures came back
-- because 20251221_add_user_region (which drops it) sorts before the migration
-- that adds it. The column holds no data in production.

-- AlterTable
ALTER TABLE "artists" DROP COLUMN IF EXISTS "spotifyAudioFeatures";

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_favorite_cities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_cities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_favorite_cities_userId_idx" ON "user_favorite_cities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_favorite_cities_userId_city_key" ON "user_favorite_cities"("userId", "city");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "events_isMusic_idx" ON "events"("isMusic");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "events_startsAt_idx" ON "events"("startsAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "events_eventType_idx" ON "events"("eventType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_event_attendance_userId_status_idx" ON "user_event_attendance"("userId", "status");

-- AddForeignKey
ALTER TABLE "user_favorite_cities" ADD CONSTRAINT "user_favorite_cities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
