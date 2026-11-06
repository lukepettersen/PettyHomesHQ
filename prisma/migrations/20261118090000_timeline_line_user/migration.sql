-- Whose HQ number or Gmail a call, text or email came in on (owner 2026-11-06: last call / text / email count the
-- owner's only, not a teammate's). Non-destructive: a new column, filled in for past entries from the phone records.
ALTER TABLE "TimelineEntry" ADD COLUMN "lineUserId" TEXT;

-- Answered calls linked to a call record: that call's HQ number.
UPDATE "TimelineEntry" t SET "lineUserId" = u."id"
FROM "PhoneCall" c JOIN "User" u ON u."textNumber" = c."ourNumber"
WHERE c."entryId" = t."id" AND t."authorId" IS NULL AND t."lineUserId" IS NULL;

-- Other incoming calls ("Called Alyssa's business number (952-555-0000)…"): the number in the text.
UPDATE "TimelineEntry" t SET "lineUserId" = u."id"
FROM "User" u
WHERE t."kind" = 'call' AND t."authorId" IS NULL AND t."lineUserId" IS NULL AND t."fubKey" IS NULL
  AND t."body" LIKE 'Called %business number (%'
  AND u."textNumber" = '+1' || regexp_replace(substring(t."body" from '\(([0-9() -]+)\)'), '[^0-9]', '', 'g');

-- Texts received: the matching text message (same contact, same words, within a minute) tells whose number.
UPDATE "TimelineEntry" t SET "lineUserId" = u."id"
FROM "TextMessage" m JOIN "User" u ON u."textNumber" = m."ourNumber"
WHERE t."kind" = 'text' AND t."outcome" = 'Received' AND t."authorId" IS NULL AND t."lineUserId" IS NULL
  AND m."personId" = t."personId" AND m."direction" = 'in' AND m."body" = t."body"
  AND m."createdAt" BETWEEN t."createdAt" - interval '1 minute' AND t."createdAt" + interval '1 minute';

-- Last text: where a teammate's text set it, go back to the owner's latest text (or none).
WITH owners AS (SELECT "id" FROM "User" WHERE "isOwner"),
teammate_set AS (
  SELECT DISTINCT p."id" FROM "Person" p JOIN "TimelineEntry" t ON t."personId" = p."id"
  WHERE p."lastTextAt" IS NOT NULL AND t."kind" = 'text' AND t."deletedAt" IS NULL
    AND COALESCE(t."authorId", t."lineUserId") IS NOT NULL
    AND COALESCE(t."authorId", t."lineUserId") NOT IN (SELECT "id" FROM owners)
    AND t."createdAt" BETWEEN p."lastTextAt" - interval '10 seconds' AND p."lastTextAt" + interval '10 seconds'
)
UPDATE "Person" p SET "lastTextAt" = (
  SELECT MAX(t."createdAt") FROM "TimelineEntry" t
  WHERE t."personId" = p."id" AND t."kind" = 'text' AND t."deletedAt" IS NULL
    AND (COALESCE(t."authorId", t."lineUserId") IS NULL OR COALESCE(t."authorId", t."lineUserId") IN (SELECT "id" FROM owners))
)
WHERE p."id" IN (SELECT "id" FROM teammate_set);
