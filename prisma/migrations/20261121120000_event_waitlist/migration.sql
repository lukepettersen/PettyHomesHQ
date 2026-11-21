-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "offerText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "waitlistLabel" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "offerText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "waitlistLabel" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "EventInterest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "slotIds" TEXT[],
    "note" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventInterest_personId_idx" ON "EventInterest"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "EventInterest_eventId_personId_key" ON "EventInterest"("eventId", "personId");

-- AddForeignKey
ALTER TABLE "EventInterest" ADD CONSTRAINT "EventInterest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInterest" ADD CONSTRAINT "EventInterest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

