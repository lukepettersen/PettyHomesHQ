-- AlterTable
ALTER TABLE "EventInterest" ADD COLUMN     "tier" TEXT NOT NULL DEFAULT '';


-- Tiers imported from the season sheet's "B Clients Interested" / "C Clients Interested" columns (kept as the note).
UPDATE "EventInterest" SET "tier" = upper(substring("note" from '^\s*([ABCabc])\s+[Cc]lients?')) WHERE "note" ~* '^\s*[abc]\s+clients?';
UPDATE "EventInterest" SET "note" = '' WHERE "note" ~* '^\s*[abc]\s+clients?\s+interested\s*$';
