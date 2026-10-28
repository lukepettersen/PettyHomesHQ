-- Archive conversations in Messages (owner request 2026-10-28). Additive: a new table only.
CREATE TABLE "TextArchive" (
    "ourNumber" TEXT NOT NULL,
    "theirNumber" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedById" TEXT,

    CONSTRAINT "TextArchive_pkey" PRIMARY KEY ("ourNumber","theirNumber")
);
