-- CreateEnum
CREATE TYPE "EventReportReason" AS ENUM ('WRONG_DATE', 'WRONG_VENUE', 'CANCELLED', 'DUPLICATE', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "EventReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable: Add community submission fields to events
ALTER TABLE "events" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "events" ADD COLUMN "locationName" TEXT;
ALTER TABLE "events" ADD COLUMN "locationAddress" TEXT;
ALTER TABLE "events" ADD COLUMN "locationCity" TEXT;
ALTER TABLE "events" ADD COLUMN "locationState" TEXT;
ALTER TABLE "events" ADD COLUMN "locationLat" DOUBLE PRECISION;
ALTER TABLE "events" ADD COLUMN "locationLng" DOUBLE PRECISION;

-- AlterTable: Add communitySubmissions to venues
ALTER TABLE "venues" ADD COLUMN "communitySubmissions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: event_reports
CREATE TABLE "event_reports" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "reason" "EventReportReason" NOT NULL,
    "message" TEXT,
    "status" "EventReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable: venue_moderators
CREATE TABLE "venue_moderators" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_moderators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_reports_eventId_idx" ON "event_reports"("eventId");
CREATE INDEX "event_reports_status_idx" ON "event_reports"("status");
CREATE INDEX "event_reports_ipAddress_createdAt_idx" ON "event_reports"("ipAddress", "createdAt");
CREATE INDEX "events_submittedById_idx" ON "events"("submittedById");
CREATE UNIQUE INDEX "venue_moderators_venueId_userId_key" ON "venue_moderators"("venueId", "userId");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_moderators" ADD CONSTRAINT "venue_moderators_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_moderators" ADD CONSTRAINT "venue_moderators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Set all existing PENDING events to APPROVED
-- (scraped events should be auto-approved; PENDING will now mean "awaiting community review")
UPDATE events SET "reviewStatus" = 'APPROVED' WHERE "reviewStatus" = 'PENDING';
