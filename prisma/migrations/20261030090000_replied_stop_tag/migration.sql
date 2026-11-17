-- "Unsubscribed" now only stops email; texting uses its own "Replied STOP" tag (owner 2026-10-24).
-- People who actually texted STOP (HQ noted it on their timeline) get the new tag; nobody loses a tag.
INSERT INTO "Tag" ("id", "name", "createdAt")
SELECT 'tag_replied_stop', 'Replied STOP', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Tag" WHERE "name" = 'Replied STOP');

INSERT INTO "PersonTag" ("personId", "tagId")
SELECT DISTINCT te."personId", t."id"
FROM "TimelineEntry" te
JOIN "Tag" t ON t."name" = 'Replied STOP'
WHERE te."kind" = 'system' AND te."body" LIKE 'They replied STOP%'
  AND NOT EXISTS (
    SELECT 1 FROM "TimelineEntry" back
    WHERE back."personId" = te."personId" AND back."kind" = 'system' AND back."body" LIKE 'They opted back in%' AND back."createdAt" > te."createdAt"
  )
ON CONFLICT DO NOTHING;
