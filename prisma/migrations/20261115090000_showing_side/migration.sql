-- Showings we book for buyers (owner request 2026-11-03). Adds columns only.
ALTER TABLE "Showing" ADD COLUMN "side" TEXT NOT NULL DEFAULT 'listing';
ALTER TABLE "Showing" ADD COLUMN "noTexts" BOOLEAN NOT NULL DEFAULT false;
