-- Claude app connector (owner request 2026-11-17): OAuth clients and grants (hashed tokens only)
CREATE TABLE "McpClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpClient_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "McpGrant" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeChallenge" TEXT,
    "redirectUri" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "McpGrant_tokenHash_key" ON "McpGrant"("tokenHash");
CREATE INDEX "McpGrant_userId_kind_idx" ON "McpGrant"("userId", "kind");
ALTER TABLE "McpGrant" ADD CONSTRAINT "McpGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
