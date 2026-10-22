-- Group texts that arrive as plain texts with OtherRecipients get a thread of their own (owner 2026-10-22);
-- the Conversation used to reply is remembered separately.
ALTER TABLE "TextThread" ADD COLUMN "conversationSid" TEXT;
UPDATE "TextThread" SET "conversationSid" = "sid" WHERE "sid" LIKE 'CH%';
CREATE UNIQUE INDEX "TextThread_conversationSid_key" ON "TextThread"("conversationSid");
