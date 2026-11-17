-- Submit offer (owner request 2026-10-19): offers submitted from HQ, on the buyer deal.
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Offer_fileId_idx" ON "Offer"("fileId");
CREATE INDEX "Offer_personId_idx" ON "Offer"("personId");
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ClientFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
