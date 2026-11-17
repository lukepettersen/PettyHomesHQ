-- Copied from Follow Up Boss (notes, calls, texts; templates): never added twice, and can be removed again.
ALTER TABLE "TimelineEntry" ADD COLUMN "fubKey" TEXT;
CREATE UNIQUE INDEX "TimelineEntry_fubKey_key" ON "TimelineEntry"("fubKey");
ALTER TABLE "MessageTemplate" ADD COLUMN "fubKey" TEXT;
CREATE UNIQUE INDEX "MessageTemplate_fubKey_key" ON "MessageTemplate"("fubKey");
