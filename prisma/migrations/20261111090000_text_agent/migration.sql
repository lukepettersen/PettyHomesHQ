-- Text assistant memory and actions (owner request 2026-10-30)
CREATE TABLE "TextAgentTurn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TextAgentTurn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TextAgentTurn_userId_createdAt_idx" ON "TextAgentTurn"("userId", "createdAt");
CREATE TABLE "TextAgentAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TextAgentAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TextAgentAction_userId_createdAt_idx" ON "TextAgentAction"("userId", "createdAt");
