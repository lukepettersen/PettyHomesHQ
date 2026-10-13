-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_key_key" ON "Document"("key");

-- CreateIndex
CREATE INDEX "Document_personId_idx" ON "Document"("personId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

