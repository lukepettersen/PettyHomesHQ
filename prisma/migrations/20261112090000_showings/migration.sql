-- Showings on our listings from ShowingTime emails (owner request 2026-11-01). Additive only.
ALTER TABLE "Task" ADD COLUMN "showingId" TEXT;

CREATE TABLE "Showing" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sellerId" TEXT,
    "address" TEXT NOT NULL,
    "mlsId" TEXT,
    "date" DATE NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "total" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Showing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Showing_key_key" ON "Showing"("key");
CREATE INDEX "Showing_agentId_idx" ON "Showing"("agentId");
ALTER TABLE "Showing" ADD CONSTRAINT "Showing_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Showing" ADD CONSTRAINT "Showing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
