-- Scheduled texts (owner request 2026-10-28). Additive: a new table only.
CREATE TABLE "ScheduledText" (
    "id" TEXT NOT NULL,
    "personId" TEXT,
    "numbers" TEXT[],
    "body" TEXT NOT NULL,
    "media" JSONB NOT NULL DEFAULT '[]',
    "sendAt" TIMESTAMP(3) NOT NULL,
    "taskId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledText_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduledText_status_sendAt_idx" ON "ScheduledText"("status", "sendAt");
CREATE INDEX "ScheduledText_personId_idx" ON "ScheduledText"("personId");
