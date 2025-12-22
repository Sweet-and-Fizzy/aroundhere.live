-- CreateTable
CREATE TABLE "user_favorite_event_types" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_event_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_favorite_event_types_userId_idx" ON "user_favorite_event_types"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorite_event_types_userId_eventType_key" ON "user_favorite_event_types"("userId", "eventType");

-- AddForeignKey
ALTER TABLE "user_favorite_event_types" ADD CONSTRAINT "user_favorite_event_types_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
