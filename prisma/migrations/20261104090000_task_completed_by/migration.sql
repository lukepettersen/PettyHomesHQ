-- Who checked a task off, for Done today on the Tasks page (owner request 2026-10-28). Additive: one column.
ALTER TABLE "Task" ADD COLUMN "completedById" TEXT;
