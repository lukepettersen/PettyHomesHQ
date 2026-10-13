-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "TaskList" ADD COLUMN     "builtin" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_sourceKey_key" ON "Task"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "TaskList_builtin_key" ON "TaskList"("builtin");

