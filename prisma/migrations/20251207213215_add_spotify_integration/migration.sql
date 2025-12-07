-- CreateEnum
CREATE TYPE "SpotifyMatchStatus" AS ENUM ('PENDING', 'AUTO_MATCHED', 'NEEDS_REVIEW', 'VERIFIED', 'NO_MATCH');

-- AlterTable
ALTER TABLE "artists" ADD COLUMN     "spotifyMatchConfidence" DOUBLE PRECISION,
ADD COLUMN     "spotifyMatchStatus" "SpotifyMatchStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "spotifyName" TEXT,
ADD COLUMN     "spotifyPopularTracks" JSONB,
ADD COLUMN     "spotifyTracksUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "spotify_playlists" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "regionId" TEXT,
    "daysAhead" INTEGER NOT NULL DEFAULT 30,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotify_playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotify_playlist_tracks" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "trackUri" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotify_playlist_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spotify_playlists_playlistId_key" ON "spotify_playlists"("playlistId");

-- CreateIndex
CREATE INDEX "spotify_playlist_tracks_playlistId_idx" ON "spotify_playlist_tracks"("playlistId");

-- CreateIndex
CREATE INDEX "spotify_playlist_tracks_eventId_idx" ON "spotify_playlist_tracks"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_playlist_tracks_playlistId_trackUri_key" ON "spotify_playlist_tracks"("playlistId", "trackUri");

-- CreateIndex
CREATE INDEX "artists_spotifyMatchStatus_idx" ON "artists"("spotifyMatchStatus");
