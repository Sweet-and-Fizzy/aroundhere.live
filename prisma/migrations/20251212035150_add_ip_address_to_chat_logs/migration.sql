-- AlterTable
ALTER TABLE "chat_logs" ADD COLUMN     "ipAddress" TEXT;

-- CreateIndex
CREATE INDEX "chat_logs_ipAddress_timestamp_idx" ON "chat_logs"("ipAddress", "timestamp");
