-- AlterTable
ALTER TABLE "GoogleConnection" ADD COLUMN "gmailSyncedAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "TimelineEntry" ADD COLUMN "gmailId" TEXT;
-- CreateIndex
CREATE UNIQUE INDEX "TimelineEntry_gmailId_key" ON "TimelineEntry"("gmailId");
