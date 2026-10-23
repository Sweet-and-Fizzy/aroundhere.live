-- AlterTable
ALTER TABLE "sources" ADD COLUMN "lastFoundCount" INTEGER,
ADD COLUMN "silentSince" TIMESTAMP(3);

-- Backfill: scrapers already silent started their silence when their last
-- event passed, so they go to the weekly reminder instead of all showing as
-- new on the first digest. Sources that never had an event use their creation date.
UPDATE "sources" s
SET "silentSince" = COALESCE(
  (SELECT MAX(e."startsAt")
   FROM "event_sources" es
   JOIN "events" e ON e.id = es."eventId"
   WHERE es."sourceId" = s.id AND e."startsAt" < NOW()),
  s."createdAt"
)
WHERE s."lastEventCount" = 0;
