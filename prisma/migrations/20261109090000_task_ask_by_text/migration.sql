-- "Ask by text" checklist steps (owner request 2026-10-30)
ALTER TABLE "Task" ADD COLUMN "askState" TEXT;
ALTER TABLE "Task" ADD COLUMN "askedAt" TIMESTAMP(3);
CREATE INDEX "Task_askState_dueDate_idx" ON "Task"("askState", "dueDate");
