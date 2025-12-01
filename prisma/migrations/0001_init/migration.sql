-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('BAR', 'CLUB', 'THEATER', 'CONCERT_HALL', 'OUTDOOR', 'CAFE', 'RESTAURANT', 'HOUSE_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "AgeRestriction" AS ENUM ('ALL_AGES', 'EIGHTEEN_PLUS', 'TWENTY_ONE_PLUS');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MUSIC', 'DJ', 'OPEN_MIC', 'COMEDY', 'THEATER', 'TRIVIA', 'KARAOKE', 'PRIVATE', 'FILM', 'SPOKEN_WORD', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('SCRAPER', 'API', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "SourceCategory" AS ENUM ('VENUE', 'TICKETING', 'PROMOTER', 'ARTIST', 'AGGREGATOR', 'SOCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'LIAISON', 'USER');

-- CreateEnum
CREATE TYPE "AgentSessionType" AS ENUM ('VENUE_INFO', 'EVENT_SCRAPER');

-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('IN_PROGRESS', 'SUCCESS', 'FAILED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "defaultRadius" INTEGER NOT NULL DEFAULT 25,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "capacity" INTEGER,
    "venueType" "VenueType" NOT NULL DEFAULT 'OTHER',
    "website" TEXT,
    "phone" TEXT,
    "logoUrl" TEXT,
    "imageUrl" TEXT,
    "description" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "genres" TEXT[],
    "description" TEXT,
    "website" TEXT,
    "socialLinks" JSONB,
    "musicbrainzId" TEXT,
    "spotifyId" TEXT,
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "venueId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "descriptionHtml" TEXT,
    "imageUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "doorsAt" TIMESTAMP(3),
    "coverCharge" TEXT,
    "ageRestriction" "AgeRestriction" NOT NULL DEFAULT 'ALL_AGES',
    "ticketUrl" TEXT,
    "genres" TEXT[],
    "isMusic" BOOLEAN,
    "eventType" "EventType",
    "canonicalGenres" TEXT[],
    "classifiedAt" TIMESTAMP(3),
    "classificationConfidence" DOUBLE PRECISION,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "sourceEventId" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_artists" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "setTime" TIMESTAMP(3),

    CONSTRAINT "event_artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "category" "SourceCategory" NOT NULL DEFAULT 'OTHER',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "website" TEXT,
    "parserVersion" TEXT,
    "config" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "runFrequency" INTEGER NOT NULL DEFAULT 86400,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "lastEventCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_sources" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceEventId" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawData" JSONB,

    CONSTRAINT "event_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sessionType" "AgentSessionType" NOT NULL,
    "status" "AgentSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "llmProvider" TEXT NOT NULL,
    "llmModel" TEXT NOT NULL,
    "currentIteration" INTEGER NOT NULL DEFAULT 0,
    "maxIterations" INTEGER NOT NULL DEFAULT 5,
    "venueData" JSONB,
    "eventData" JSONB,
    "generatedCode" TEXT,
    "completenessScore" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "thinking" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "venueId" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_attempts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "reasoning" TEXT,
    "planDescription" TEXT,
    "generatedCode" TEXT NOT NULL,
    "codeHash" TEXT,
    "executionStatus" TEXT NOT NULL,
    "executionError" TEXT,
    "executionTime" INTEGER,
    "scrapedData" JSONB,
    "fieldsFound" TEXT[],
    "fieldsMissing" TEXT[],
    "completenessScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "scraper_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_configs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "models" JSONB NOT NULL,
    "defaultModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "regions_slug_key" ON "regions"("slug");

-- CreateIndex
CREATE INDEX "venues_regionId_idx" ON "venues"("regionId");

-- CreateIndex
CREATE INDEX "venues_latitude_longitude_idx" ON "venues"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "venues_regionId_slug_key" ON "venues"("regionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "artists_slug_key" ON "artists"("slug");

-- CreateIndex
CREATE INDEX "artists_name_idx" ON "artists"("name");

-- CreateIndex
CREATE INDEX "events_regionId_startsAt_idx" ON "events"("regionId", "startsAt");

-- CreateIndex
CREATE INDEX "events_venueId_idx" ON "events"("venueId");

-- CreateIndex
CREATE INDEX "events_reviewStatus_idx" ON "events"("reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "events_sourceId_sourceEventId_key" ON "events"("sourceId", "sourceEventId");

-- CreateIndex
CREATE INDEX "event_artists_artistId_idx" ON "event_artists"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "event_artists_eventId_artistId_key" ON "event_artists"("eventId", "artistId");

-- CreateIndex
CREATE UNIQUE INDEX "sources_name_key" ON "sources"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sources_slug_key" ON "sources"("slug");

-- CreateIndex
CREATE INDEX "event_sources_sourceId_idx" ON "event_sources"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "event_sources_eventId_sourceId_key" ON "event_sources"("eventId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE INDEX "genres_parentId_idx" ON "genres"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "agent_sessions_status_idx" ON "agent_sessions"("status");

-- CreateIndex
CREATE INDEX "agent_sessions_createdAt_idx" ON "agent_sessions"("createdAt");

-- CreateIndex
CREATE INDEX "scraper_attempts_sessionId_idx" ON "scraper_attempts"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "scraper_attempts_sessionId_attemptNumber_key" ON "scraper_attempts"("sessionId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "llm_configs_provider_key" ON "llm_configs"("provider");

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_artists" ADD CONSTRAINT "event_artists_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_artists" ADD CONSTRAINT "event_artists_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genres" ADD CONSTRAINT "genres_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "genres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_attempts" ADD CONSTRAINT "scraper_attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

