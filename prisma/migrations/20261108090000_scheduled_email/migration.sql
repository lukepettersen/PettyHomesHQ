-- Scheduled emails (owner request 2026-10-29)
CREATE TABLE "ScheduledEmail" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "to" TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "signature" BOOLEAN NOT NULL DEFAULT true,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "sendAt" TIMESTAMP(3) NOT NULL,
    "taskId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduledEmail_status_sendAt_idx" ON "ScheduledEmail"("status", "sendAt");
CREATE INDEX "ScheduledEmail_personId_idx" ON "ScheduledEmail"("personId");
