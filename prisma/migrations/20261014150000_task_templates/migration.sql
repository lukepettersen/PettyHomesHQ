-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "advanceStatusId" TEXT,
ADD COLUMN     "anchor" TEXT,
ADD COLUMN     "fileId" TEXT,
ADD COLUMN     "offsetDays" INTEGER,
ADD COLUMN     "paId" TEXT,
ADD COLUMN     "phase" TEXT,
ADD COLUMN     "stepId" TEXT,
ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT,
    "phases" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_fileId_idx" ON "Task"("fileId");

-- CreateIndex
CREATE INDEX "Task_paId_idx" ON "Task"("paId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ClientFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_paId_fkey" FOREIGN KEY ("paId") REFERENCES "PurchaseAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

