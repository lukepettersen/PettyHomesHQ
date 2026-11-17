-- What an "Ask by text" step asks (owner request 2026-10-30)
ALTER TABLE "Task" ADD COLUMN "askKind" TEXT;
UPDATE "Task" SET "askKind" = 'done' WHERE "askState" IS NOT NULL AND "askKind" IS NULL;
