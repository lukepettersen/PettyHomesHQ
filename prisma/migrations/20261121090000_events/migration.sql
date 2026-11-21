-- AlterTable
ALTER TABLE "ScheduledText" ADD COLUMN     "eventKey" TEXT;

-- CreateTable
CREATE TABLE "EventTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "multiSlot" BOOLEAN NOT NULL DEFAULT false,
    "doneLabel" TEXT NOT NULL DEFAULT 'Tickets sent',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "reminders" JSONB NOT NULL DEFAULT '[]',
    "location" TEXT NOT NULL DEFAULT '',
    "intro" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EventTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "multiSlot" BOOLEAN NOT NULL DEFAULT false,
    "doneLabel" TEXT NOT NULL DEFAULT 'Tickets sent',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "location" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "intro" TEXT NOT NULL DEFAULT '',
    "senderId" TEXT,
    "signupKey" TEXT,
    "signupOn" BOOLEAN NOT NULL DEFAULT false,
    "signupOpensAt" TIMESTAMP(3),
    "signupClosesAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSlot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "opponent" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReminder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "daysBefore" INTEGER NOT NULL DEFAULT 1,
    "time" TEXT NOT NULL DEFAULT '10:00',
    "statuses" TEXT[] DEFAULT ARRAY['confirmed', 'sent']::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_signupKey_key" ON "Event"("signupKey");

-- CreateIndex
CREATE INDEX "EventSlot_eventId_date_idx" ON "EventSlot"("eventId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EventSlot_eventId_externalId_key" ON "EventSlot"("eventId", "externalId");

-- CreateIndex
CREATE INDEX "EventAttendee_personId_idx" ON "EventAttendee"("personId");

-- CreateIndex
CREATE INDEX "EventAttendee_eventId_idx" ON "EventAttendee"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAttendee_slotId_personId_key" ON "EventAttendee"("slotId", "personId");

-- CreateIndex
CREATE INDEX "EventReminder_eventId_idx" ON "EventReminder"("eventId");

-- CreateIndex
CREATE INDEX "ScheduledText_eventKey_idx" ON "ScheduledText"("eventKey");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSlot" ADD CONSTRAINT "EventSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "EventSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

