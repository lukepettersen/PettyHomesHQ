-- Business texting (SPEC.md §11): one Twilio number per team member, texts and missed calls.
ALTER TABLE "User" ADD COLUMN "textNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "forwardTo" TEXT;
CREATE UNIQUE INDEX "User_textNumber_key" ON "User"("textNumber");

ALTER TABLE "Notification" ADD COLUMN "link" TEXT;

CREATE TABLE "TextMessage" (
    "id" TEXT NOT NULL,
    "ourNumber" TEXT NOT NULL,
    "theirNumber" TEXT NOT NULL,
    "personId" TEXT,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'sms',
    "body" TEXT NOT NULL DEFAULT '',
    "twilioSid" TEXT,
    "status" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "sentById" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TextMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TextMessage_twilioSid_key" ON "TextMessage"("twilioSid");
CREATE INDEX "TextMessage_ourNumber_theirNumber_createdAt_idx" ON "TextMessage"("ourNumber", "theirNumber", "createdAt");
CREATE INDEX "TextMessage_personId_idx" ON "TextMessage"("personId");
ALTER TABLE "TextMessage" ADD CONSTRAINT "TextMessage_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TextMessage" ADD CONSTRAINT "TextMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
