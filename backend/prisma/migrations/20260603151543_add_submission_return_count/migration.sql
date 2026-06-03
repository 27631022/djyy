-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "formData" TEXT NOT NULL DEFAULT '{}',
    "fileIds" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedById" TEXT,
    "submittedAt" DATETIME,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "returnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TaskSubmission" ("createdAt", "fileIds", "formData", "id", "reviewNote", "reviewedAt", "reviewedById", "status", "submittedAt", "submittedById", "targetId", "taskId", "updatedAt") SELECT "createdAt", "fileIds", "formData", "id", "reviewNote", "reviewedAt", "reviewedById", "status", "submittedAt", "submittedById", "targetId", "taskId", "updatedAt" FROM "TaskSubmission";
DROP TABLE "TaskSubmission";
ALTER TABLE "new_TaskSubmission" RENAME TO "TaskSubmission";
CREATE UNIQUE INDEX "TaskSubmission_targetId_key" ON "TaskSubmission"("targetId");
CREATE INDEX "TaskSubmission_taskId_idx" ON "TaskSubmission"("taskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
