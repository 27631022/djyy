-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetOrgId" TEXT,
    "targetUserId" TEXT,
    "ownerUserId" TEXT,
    "handlerOrgId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedById" TEXT,
    "assignedAt" DATETIME,
    "confirmStatus" TEXT NOT NULL DEFAULT 'none',
    "senderConfirm" TEXT,
    "senderConfirmById" TEXT,
    "receiverConfirm" TEXT,
    "receiverConfirmById" TEXT,
    "confirmNote" TEXT,
    "confirmActedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TaskTarget" ("assignedAt", "assignedById", "createdAt", "handlerOrgId", "id", "ownerUserId", "status", "targetOrgId", "targetType", "targetUserId", "taskId", "updatedAt") SELECT "assignedAt", "assignedById", "createdAt", "handlerOrgId", "id", "ownerUserId", "status", "targetOrgId", "targetType", "targetUserId", "taskId", "updatedAt" FROM "TaskTarget";
DROP TABLE "TaskTarget";
ALTER TABLE "new_TaskTarget" RENAME TO "TaskTarget";
CREATE INDEX "TaskTarget_taskId_idx" ON "TaskTarget"("taskId");
CREATE INDEX "TaskTarget_targetOrgId_idx" ON "TaskTarget"("targetOrgId");
CREATE INDEX "TaskTarget_targetUserId_idx" ON "TaskTarget"("targetUserId");
CREATE INDEX "TaskTarget_ownerUserId_idx" ON "TaskTarget"("ownerUserId");
CREATE INDEX "TaskTarget_handlerOrgId_idx" ON "TaskTarget"("handlerOrgId");
CREATE INDEX "TaskTarget_status_idx" ON "TaskTarget"("status");
CREATE INDEX "TaskTarget_confirmStatus_idx" ON "TaskTarget"("confirmStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
