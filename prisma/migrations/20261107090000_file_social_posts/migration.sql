-- Social post descriptions per deal (owner request 2026-10-29): { "<slot>": { text, ready, at, by } }
ALTER TABLE "ClientFile" ADD COLUMN "social" JSONB NOT NULL DEFAULT '{}';
