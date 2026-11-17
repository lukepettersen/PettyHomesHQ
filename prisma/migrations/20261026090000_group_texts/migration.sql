-- Group texting through Twilio Conversations (owner request 2026-10-22).
ALTER TABLE "TextMessage" ADD COLUMN "fromNumber" TEXT;
CREATE TABLE "TextThread" (
    "sid" TEXT NOT NULL,
    "ourNumber" TEXT NOT NULL,
    "group" BOOLEAN NOT NULL DEFAULT false,
    "members" TEXT[],
    "sender" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TextThread_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX "TextThread_ourNumber_idx" ON "TextThread"("ourNumber");
