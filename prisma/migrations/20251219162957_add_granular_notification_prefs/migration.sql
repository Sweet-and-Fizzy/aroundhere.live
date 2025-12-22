-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notifyFavoriteArtists" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyFavoriteGenres" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyFavoriteVenues" BOOLEAN NOT NULL DEFAULT true;
