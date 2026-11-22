-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "paId" TEXT,
    "importKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "side" TEXT NOT NULL,
    "clientName" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "zip" TEXT NOT NULL DEFAULT '',
    "closeDate" DATE,
    "source" TEXT NOT NULL DEFAULT '',
    "initialSource" TEXT NOT NULL DEFAULT '',
    "lender" TEXT NOT NULL DEFAULT '',
    "referredFrom" TEXT NOT NULL DEFAULT '',
    "onTime" TEXT NOT NULL DEFAULT '',
    "review" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePerson" (
    "saleId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "SalePerson_pkey" PRIMARY KEY ("saleId","personId")
);

-- CreateTable
CREATE TABLE "SaleMoney" (
    "saleId" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "listPrice" INTEGER NOT NULL DEFAULT 0,
    "contributions" INTEGER NOT NULL DEFAULT 0,
    "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "net" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "splitPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionPaid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SaleMoney_pkey" PRIMARY KEY ("saleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_paId_key" ON "Sale"("paId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_importKey_key" ON "Sale"("importKey");

-- CreateIndex
CREATE INDEX "Sale_status_closeDate_idx" ON "Sale"("status", "closeDate");

-- CreateIndex
CREATE INDEX "SalePerson_personId_idx" ON "SalePerson"("personId");

-- AddForeignKey
ALTER TABLE "SalePerson" ADD CONSTRAINT "SalePerson_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePerson" ADD CONSTRAINT "SalePerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleMoney" ADD CONSTRAINT "SaleMoney_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

