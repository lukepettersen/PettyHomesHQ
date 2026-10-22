-- Answered calls and their recordings (owner request 2026-10-22).
CREATE TABLE "PhoneCall" (
    "id" TEXT NOT NULL,
    "callSid" TEXT NOT NULL,
    "ourNumber" TEXT NOT NULL DEFAULT '',
    "theirNumber" TEXT NOT NULL DEFAULT '',
    "personId" TEXT,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "recordingSid" TEXT,
    "recordingSeconds" INTEGER,
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhoneCall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhoneCall_callSid_key" ON "PhoneCall"("callSid");
CREATE INDEX "PhoneCall_personId_idx" ON "PhoneCall"("personId");
CREATE INDEX "PhoneCall_theirNumber_idx" ON "PhoneCall"("theirNumber");
