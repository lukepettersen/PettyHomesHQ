-- Photos in texts (owner request 2026-10-23).
ALTER TABLE "TextMessage" ADD COLUMN "media" JSONB NOT NULL DEFAULT '[]';
