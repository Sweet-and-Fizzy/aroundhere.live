-- CreateEnum
CREATE TYPE "EventAttendanceStatus" AS ENUM ('INTERESTED', 'GOING');

-- CreateTable
CREATE TABLE "user_event_attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "EventAttendanceStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_event_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_event_attendance_userId_idx" ON "user_event_attendance"("userId");

-- CreateIndex
CREATE INDEX "user_event_attendance_eventId_idx" ON "user_event_attendance"("eventId");

-- CreateIndex
CREATE INDEX "user_event_attendance_status_idx" ON "user_event_attendance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_event_attendance_userId_eventId_key" ON "user_event_attendance"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "user_event_attendance" ADD CONSTRAINT "user_event_attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_event_attendance" ADD CONSTRAINT "user_event_attendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
