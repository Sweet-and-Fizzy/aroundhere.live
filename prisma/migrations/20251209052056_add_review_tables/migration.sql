-- DropIndex
DROP INDEX "events_embedding_idx";

-- CreateTable
CREATE TABLE "review_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'buttondown',
    "lastFetchedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_reviews" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_sources_name_key" ON "review_sources"("name");

-- CreateIndex
CREATE UNIQUE INDEX "review_sources_slug_key" ON "review_sources"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_url_key" ON "reviews"("url");

-- CreateIndex
CREATE INDEX "reviews_sourceId_idx" ON "reviews"("sourceId");

-- CreateIndex
CREATE INDEX "reviews_publishedAt_idx" ON "reviews"("publishedAt");

-- CreateIndex
CREATE INDEX "artist_reviews_reviewId_idx" ON "artist_reviews"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "artist_reviews_artistId_reviewId_key" ON "artist_reviews"("artistId", "reviewId");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "review_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_reviews" ADD CONSTRAINT "artist_reviews_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_reviews" ADD CONSTRAINT "artist_reviews_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
