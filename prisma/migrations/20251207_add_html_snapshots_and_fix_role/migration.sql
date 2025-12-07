-- AlterEnum: Rename LIAISON to MODERATOR
ALTER TYPE "UserRole" RENAME VALUE 'LIAISON' TO 'MODERATOR';

-- AlterTable: Add htmlSnapshots column
ALTER TABLE "scraper_attempts" ADD COLUMN "htmlSnapshots" JSONB;
