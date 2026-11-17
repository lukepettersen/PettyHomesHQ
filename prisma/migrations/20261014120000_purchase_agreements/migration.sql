-- CreateTable
CREATE TABLE "PaForm" (
    "side" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaForm_pkey" PRIMARY KEY ("side")
);

-- CreateTable
CREATE TABLE "PurchaseAgreement" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "address" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "finalAcceptance" DATE,
    "inspection" DATE,
    "writtenStatement" DATE,
    "writtenStatementNA" BOOLEAN NOT NULL DEFAULT false,
    "hoaRescission" DATE,
    "closing" DATE,
    "dateStatus" JSONB NOT NULL DEFAULT '{}',
    "originalDates" JSONB NOT NULL DEFAULT '{}',
    "endedOn" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaCommission" (
    "paId" TEXT NOT NULL,
    "commission" TEXT NOT NULL DEFAULT '',
    "bac" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PaCommission_pkey" PRIMARY KEY ("paId")
);

-- CreateIndex
CREATE INDEX "PurchaseAgreement_fileId_idx" ON "PurchaseAgreement"("fileId");

-- CreateIndex
CREATE INDEX "PurchaseAgreement_state_idx" ON "PurchaseAgreement"("state");

-- AddForeignKey
ALTER TABLE "PurchaseAgreement" ADD CONSTRAINT "PurchaseAgreement_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ClientFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaCommission" ADD CONSTRAINT "PaCommission_paId_fkey" FOREIGN KEY ("paId") REFERENCES "PurchaseAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

