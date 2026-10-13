-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start" TEXT,
    "end" TEXT,
    "location" TEXT NOT NULL DEFAULT '',
    "invitees" JSONB NOT NULL DEFAULT '[]',
    "googleEventId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Appointment_personId_date_idx" ON "Appointment"("personId", "date");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

