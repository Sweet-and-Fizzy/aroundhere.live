-- CreateIndex
CREATE INDEX "spotify_playlist_tracks_artistId_idx" ON "spotify_playlist_tracks"("artistId");

-- AddForeignKey
ALTER TABLE "spotify_playlist_tracks" ADD CONSTRAINT "spotify_playlist_tracks_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotify_playlist_tracks" ADD CONSTRAINT "spotify_playlist_tracks_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
