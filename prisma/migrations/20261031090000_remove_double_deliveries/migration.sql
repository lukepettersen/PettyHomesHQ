-- One-time cleanup (owner request 2026-10-24): group and picture texts that Twilio delivered twice (plain MM…/SM…
-- and Conversations IM…) were saved twice. Remove only the later copy of exact pairs: same line, thread, sender and
-- words, one from each route, within 3 minutes. Their duplicate timeline lines and alerts (identical, within a
-- minute) go too. Everything else is untouched.
DELETE FROM "TextMessage" later
USING "TextMessage" first
WHERE later."direction" = 'in' AND first."direction" = 'in'
  AND later."ourNumber" = first."ourNumber" AND later."theirNumber" = first."theirNumber"
  AND COALESCE(later."fromNumber", '') = COALESCE(first."fromNumber", '')
  AND later."body" = first."body"
  AND (later."twilioSid" LIKE 'IM%') <> (first."twilioSid" LIKE 'IM%')
  AND later."createdAt" >= first."createdAt" AND later."createdAt" <= first."createdAt" + INTERVAL '3 minutes'
  AND later."id" <> first."id"
  AND (later."createdAt" > first."createdAt" OR later."id" > first."id");

DELETE FROM "TimelineEntry" later
USING "TimelineEntry" first
WHERE later."kind" = 'text' AND first."kind" = 'text' AND later."outcome" = 'Received' AND first."outcome" = 'Received'
  AND later."personId" = first."personId" AND later."body" = first."body" AND later."deletedAt" IS NULL AND first."deletedAt" IS NULL
  AND later."createdAt" >= first."createdAt" AND later."createdAt" <= first."createdAt" + INTERVAL '1 minute'
  AND later."id" <> first."id"
  AND (later."createdAt" > first."createdAt" OR later."id" > first."id");

DELETE FROM "Notification" later
USING "Notification" first
WHERE later."toId" = first."toId" AND later."text" = first."text"
  AND (later."text" LIKE 'Text from %' OR later."text" LIKE 'Group text from %')
  AND later."createdAt" >= first."createdAt" AND later."createdAt" <= first."createdAt" + INTERVAL '1 minute'
  AND later."id" <> first."id"
  AND (later."createdAt" > first."createdAt" OR later."id" > first."id");
