-- "Due for a touch" counts from the last text (owner, 2026-10-14).
ALTER TABLE "Person" ADD COLUMN "lastTextAt" TIMESTAMP(3);
-- Backfill from texts already on timelines.
UPDATE "Person" p SET "lastTextAt" = t.last
FROM (SELECT "personId", MAX("createdAt") AS last FROM "TimelineEntry" WHERE "kind" = 'text' AND "deletedAt" IS NULL GROUP BY "personId") t
WHERE t."personId" = p."id";
