-- Checklist steps that send a text or email by themselves (owner request 2026-10-29). Additive: three columns.
ALTER TABLE "Task" ADD COLUMN "autoSend" JSONB;
ALTER TABLE "Task" ADD COLUMN "autoState" TEXT;
ALTER TABLE "Task" ADD COLUMN "autoError" TEXT;
CREATE INDEX "Task_autoState_dueDate_idx" ON "Task"("autoState", "dueDate");
