-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReportTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetOrgId" TEXT,
    "targetUserId" TEXT,
    "handlerOrgId" TEXT,
    "ownerUserId" TEXT,
    "goalTargetsJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedById" TEXT,
    "assignedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ReportTarget" ("assignedAt", "assignedById", "createdAt", "handlerOrgId", "id", "ownerUserId", "status", "targetOrgId", "targetType", "targetUserId", "taskId", "updatedAt") SELECT "assignedAt", "assignedById", "createdAt", "handlerOrgId", "id", "ownerUserId", "status", "targetOrgId", "targetType", "targetUserId", "taskId", "updatedAt" FROM "ReportTarget";
DROP TABLE "ReportTarget";
ALTER TABLE "new_ReportTarget" RENAME TO "ReportTarget";
CREATE INDEX "ReportTarget_taskId_idx" ON "ReportTarget"("taskId");
CREATE INDEX "ReportTarget_targetOrgId_idx" ON "ReportTarget"("targetOrgId");
CREATE INDEX "ReportTarget_targetUserId_idx" ON "ReportTarget"("targetUserId");
CREATE INDEX "ReportTarget_handlerOrgId_idx" ON "ReportTarget"("handlerOrgId");
CREATE INDEX "ReportTarget_ownerUserId_idx" ON "ReportTarget"("ownerUserId");
CREATE INDEX "ReportTarget_status_idx" ON "ReportTarget"("status");
CREATE TABLE "new_ReportTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "fieldsJson" TEXT NOT NULL DEFAULT '[]',
    "goalsJson" TEXT NOT NULL DEFAULT '[]',
    "catalogTag" TEXT,
    "dispatchUserId" TEXT NOT NULL,
    "dispatchOrgId" TEXT,
    "dueAt" DATETIME,
    "noticeFileId" TEXT,
    "noticeFileName" TEXT,
    "seriesId" TEXT,
    "periodLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ReportTask" ("catalogTag", "createdAt", "dispatchOrgId", "dispatchUserId", "dueAt", "fieldsJson", "id", "notes", "noticeFileId", "noticeFileName", "periodLabel", "seriesId", "status", "templateId", "title", "updatedAt") SELECT "catalogTag", "createdAt", "dispatchOrgId", "dispatchUserId", "dueAt", "fieldsJson", "id", "notes", "noticeFileId", "noticeFileName", "periodLabel", "seriesId", "status", "templateId", "title", "updatedAt" FROM "ReportTask";
DROP TABLE "ReportTask";
ALTER TABLE "new_ReportTask" RENAME TO "ReportTask";
CREATE INDEX "ReportTask_dispatchUserId_idx" ON "ReportTask"("dispatchUserId");
CREATE INDEX "ReportTask_dispatchOrgId_idx" ON "ReportTask"("dispatchOrgId");
CREATE INDEX "ReportTask_status_idx" ON "ReportTask"("status");
CREATE INDEX "ReportTask_seriesId_idx" ON "ReportTask"("seriesId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
