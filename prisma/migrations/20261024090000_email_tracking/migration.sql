-- Open tracking for mass emails (owner decision 2026-10-21).
CREATE TABLE "EmailTrack" (
    "id" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "entryId" TEXT,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "opens" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EmailTrack_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailTrack_batch_idx" ON "EmailTrack"("batch");
CREATE INDEX "EmailTrack_personId_idx" ON "EmailTrack"("personId");
