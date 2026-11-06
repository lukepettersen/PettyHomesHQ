-- Mass text from People (owner request 2026-11-06)
CREATE TABLE "BulkTextJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "media" JSONB NOT NULL DEFAULT '[]',
    "personIds" JSONB NOT NULL,
    "doneIds" JSONB NOT NULL DEFAULT '[]',
    "sent" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" JSONB NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL DEFAULT 'sending',
    "error" TEXT,
    "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BulkTextJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BulkTextJob_state_idx" ON "BulkTextJob"("state");
