-- CreateEnum (will skip if exists)
DO $$ BEGIN
  CREATE TYPE "ScraperVersionOrigin" AS ENUM ('AI_GENERATED', 'MANUAL_EDIT', 'ROLLBACK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable (will skip if exists)
CREATE TABLE IF NOT EXISTS "scraper_versions" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT,
    "createdFrom" "ScraperVersionOrigin" NOT NULL,
    "agentSessionId" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "testResults" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraper_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (will skip if exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'scraper_versions'
    AND indexname = 'scraper_versions_sourceId_versionNumber_key'
  ) THEN
    CREATE UNIQUE INDEX "scraper_versions_sourceId_versionNumber_key" ON "scraper_versions"("sourceId", "versionNumber");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'scraper_versions'
    AND indexname = 'scraper_versions_sourceId_isActive_idx'
  ) THEN
    CREATE INDEX "scraper_versions_sourceId_isActive_idx" ON "scraper_versions"("sourceId", "isActive");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'scraper_versions'
    AND indexname = 'scraper_versions_sourceId_codeHash_idx'
  ) THEN
    CREATE INDEX "scraper_versions_sourceId_codeHash_idx" ON "scraper_versions"("sourceId", "codeHash");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'scraper_versions'
    AND indexname = 'scraper_versions_agentSessionId_idx'
  ) THEN
    CREATE INDEX "scraper_versions_agentSessionId_idx" ON "scraper_versions"("agentSessionId");
  END IF;
END $$;

-- AddForeignKey (will skip if exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scraper_versions_sourceId_fkey'
  ) THEN
    ALTER TABLE "scraper_versions" ADD CONSTRAINT "scraper_versions_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
