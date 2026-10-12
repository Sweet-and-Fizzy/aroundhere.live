-- CreateTable
CREATE TABLE "cron_runs" (
    "name" TEXT NOT NULL,
    "lastFinishedAt" TIMESTAMP(3) NOT NULL,
    "lastStatus" INTEGER NOT NULL,
    "lastError" TEXT,
    "lastDurationMs" INTEGER NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "prevSuccessAt" TIMESTAMP(3),

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("name")
);
