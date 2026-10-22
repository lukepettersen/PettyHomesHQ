-- iPhone reactions shown as icons on the message they react to (owner request 2026-10-22).
ALTER TABLE "TextMessage" ADD COLUMN "reactions" JSONB NOT NULL DEFAULT '[]';
