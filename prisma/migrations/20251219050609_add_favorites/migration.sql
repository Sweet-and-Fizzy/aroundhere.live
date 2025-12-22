-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastNotificationSent" TIMESTAMP(3),
ADD COLUMN     "notificationFrequency" TEXT NOT NULL DEFAULT 'daily';

-- CreateTable
CREATE TABLE "user_favorite_artists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorite_venues" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorite_genres" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_genres_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_favorite_artists_userId_idx" ON "user_favorite_artists"("userId");

-- CreateIndex
CREATE INDEX "user_favorite_artists_artistId_idx" ON "user_favorite_artists"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorite_artists_userId_artistId_key" ON "user_favorite_artists"("userId", "artistId");

-- CreateIndex
CREATE INDEX "user_favorite_venues_userId_idx" ON "user_favorite_venues"("userId");

-- CreateIndex
CREATE INDEX "user_favorite_venues_venueId_idx" ON "user_favorite_venues"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorite_venues_userId_venueId_key" ON "user_favorite_venues"("userId", "venueId");

-- CreateIndex
CREATE INDEX "user_favorite_genres_userId_idx" ON "user_favorite_genres"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorite_genres_userId_genre_key" ON "user_favorite_genres"("userId", "genre");

-- AddForeignKey
ALTER TABLE "user_favorite_artists" ADD CONSTRAINT "user_favorite_artists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_artists" ADD CONSTRAINT "user_favorite_artists_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_venues" ADD CONSTRAINT "user_favorite_venues_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_venues" ADD CONSTRAINT "user_favorite_venues_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_genres" ADD CONSTRAINT "user_favorite_genres_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
