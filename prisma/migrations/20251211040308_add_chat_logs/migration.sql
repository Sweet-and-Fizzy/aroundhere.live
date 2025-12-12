-- CreateTable
CREATE TABLE "chat_logs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userMessage" TEXT NOT NULL,
    "conversationLength" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL,
    "llmCallsCount" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "toolsUsed" TEXT[],
    "toolInputs" JSONB,
    "responseText" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "userRating" INTEGER,

    CONSTRAINT "chat_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_logs_sessionId_idx" ON "chat_logs"("sessionId");

-- CreateIndex
CREATE INDEX "chat_logs_timestamp_idx" ON "chat_logs"("timestamp");
