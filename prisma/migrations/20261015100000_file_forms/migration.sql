-- CreateTable
CREATE TABLE "FileFormDef" (
    "kind" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileFormDef_pkey" PRIMARY KEY ("kind")
);

