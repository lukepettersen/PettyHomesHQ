-- Deal notes on buyer and seller files (owner request 2026-10-15).
ALTER TABLE "ClientFile" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClientFile" ADD COLUMN "notesAt" TIMESTAMP(3);
ALTER TABLE "ClientFile" ADD COLUMN "notesBy" TEXT;
