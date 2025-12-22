-- CreateEnum
CREATE TYPE "MusicBrainzMatchStatus" AS ENUM ('PENDING', 'AUTO_MATCHED', 'NEEDS_REVIEW', 'VERIFIED', 'NO_MATCH');

-- AlterTable
ALTER TABLE "artists" ADD COLUMN     "musicbrainzDescription" TEXT,
ADD COLUMN     "musicbrainzFetchedAt" TIMESTAMP(3),
ADD COLUMN     "musicbrainzMatchConfidence" DOUBLE PRECISION,
ADD COLUMN     "musicbrainzMatchStatus" "MusicBrainzMatchStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "musicbrainzRelatedIds" TEXT[],
ADD COLUMN     "musicbrainzTags" TEXT[],
ADD COLUMN     "profileEmbedding" vector(1536),
ADD COLUMN     "profileEmbeddingUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "spotifyAudioFeatures" JSONB,
ADD COLUMN     "spotifyFetchedAt" TIMESTAMP(3),
ADD COLUMN     "spotifyGenres" TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "enableRecommendations" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "interestDescription" TEXT,
ADD COLUMN     "interestEmbedding" vector(1536),
ADD COLUMN     "lastRecommendationSent" TIMESTAMP(3),
ADD COLUMN     "tasteProfileEmbedding" vector(1536),
ADD COLUMN     "tasteProfileUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "recommendation_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recommendationType" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "matchReason" TEXT NOT NULL,

    CONSTRAINT "recommendation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_logs_userId_sentAt_idx" ON "recommendation_logs"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "recommendation_logs_eventId_idx" ON "recommendation_logs"("eventId");

-- CreateIndex
CREATE INDEX "artists_musicbrainzMatchStatus_idx" ON "artists"("musicbrainzMatchStatus");

-- AddForeignKey
ALTER TABLE "recommendation_logs" ADD CONSTRAINT "recommendation_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_logs" ADD CONSTRAINT "recommendation_logs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
