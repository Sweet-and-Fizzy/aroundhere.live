-- AlterTable
ALTER TABLE "sources" ADD COLUMN     "notificationsPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notificationsPausedAt" TIMESTAMP(3),
ADD COLUMN     "notificationsPausedReason" TEXT;
