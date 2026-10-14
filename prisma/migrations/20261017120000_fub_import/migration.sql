-- AlterTable: where an imported person came from
ALTER TABLE "Person" ADD COLUMN "fubId" INTEGER, ADD COLUMN "importBatchId" TEXT;
CREATE UNIQUE INDEX "Person_fubId_key" ON "Person"("fubId");

-- CreateTable: import runs (Undo import)
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "added" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "undoneAt" TIMESTAMP(3),
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);
