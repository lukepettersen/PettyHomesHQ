-- Mass emails sent in the background (owner report 2026-11-02). Adds a table only.
CREATE TABLE "BulkEmailJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "signature" BOOLEAN NOT NULL DEFAULT true,
    "batch" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "personIds" JSONB NOT NULL,
    "doneIds" JSONB NOT NULL DEFAULT '[]',
    "sent" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" JSONB NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL DEFAULT 'sending',
    "error" TEXT,
    "waitUntil" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BulkEmailJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BulkEmailJob_state_idx" ON "BulkEmailJob"("state");
