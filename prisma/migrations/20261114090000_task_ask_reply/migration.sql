-- Remembers a partial "did you set a consult?" reply (owner report 2026-11-02). Adds a column only.
ALTER TABLE "Task" ADD COLUMN "askReply" TEXT;
