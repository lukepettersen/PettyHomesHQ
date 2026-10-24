-- Clear names for the two opt-outs (owner request 2026-10-24): "Email Unsubscribed" (stops emails) and
-- "Text Unsubscribed" (they texted STOP; stops texts). "Unsubscribed" (from Follow Up Boss) merges into
-- Email Unsubscribed and "Replied STOP" becomes Text Unsubscribed. Everyone keeps their opt-outs; smart lists
-- that used the old names are updated.
INSERT INTO "Tag" ("id", "name", "createdAt") SELECT 'tag_email_unsub', 'Email Unsubscribed', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Tag" WHERE "name" = 'Email Unsubscribed');
INSERT INTO "Tag" ("id", "name", "createdAt") SELECT 'tag_text_unsub', 'Text Unsubscribed', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Tag" WHERE "name" = 'Text Unsubscribed');

INSERT INTO "PersonTag" ("personId", "tagId")
SELECT pt."personId", (SELECT "id" FROM "Tag" WHERE "name" = 'Email Unsubscribed')
FROM "PersonTag" pt JOIN "Tag" t ON t."id" = pt."tagId" WHERE t."name" = 'Unsubscribed'
ON CONFLICT DO NOTHING;
INSERT INTO "PersonTag" ("personId", "tagId")
SELECT pt."personId", (SELECT "id" FROM "Tag" WHERE "name" = 'Text Unsubscribed')
FROM "PersonTag" pt JOIN "Tag" t ON t."id" = pt."tagId" WHERE t."name" = 'Replied STOP'
ON CONFLICT DO NOTHING;

-- The old tags are now empty duplicates of the new ones.
DELETE FROM "PersonTag" WHERE "tagId" IN (SELECT "id" FROM "Tag" WHERE "name" IN ('Unsubscribed', 'Replied STOP'));
DELETE FROM "Tag" WHERE "name" IN ('Unsubscribed', 'Replied STOP');

UPDATE "SmartList" SET "filters" = replace(replace("filters"::text, '"Unsubscribed"', '"Email Unsubscribed"'), '"Replied STOP"', '"Text Unsubscribed"')::jsonb
WHERE "filters"::text LIKE '%"Unsubscribed"%' OR "filters"::text LIKE '%"Replied STOP"%';
