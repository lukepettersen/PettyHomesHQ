-- Mass email: who was selected but skipped, and why (owner request 2026-11-23)
ALTER TABLE "BulkEmailJob" ADD COLUMN     "notSent" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "selected" INTEGER NOT NULL DEFAULT 0;
