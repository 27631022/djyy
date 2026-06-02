-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "fields" TEXT NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "templateId" TEXT,
    "fields" TEXT NOT NULL,
    "dispatchUserId" TEXT NOT NULL,
    "dispatchOrgId" TEXT,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaskTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetOrgId" TEXT,
    "targetUserId" TEXT,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedById" TEXT,
    "assignedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaskCollaborator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TaskSubmission" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UnitTaskRouting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitOrgId" TEXT NOT NULL,
    "sourceOrgId" TEXT NOT NULL,
    "handlerUserId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplate_code_key" ON "TaskTemplate"("code");

-- CreateIndex
CREATE INDEX "TaskTemplate_active_idx" ON "TaskTemplate"("active");

-- CreateIndex
CREATE INDEX "TaskTemplate_category_idx" ON "TaskTemplate"("category");

-- CreateIndex
CREATE INDEX "Task_dispatchUserId_idx" ON "Task"("dispatchUserId");

-- CreateIndex
CREATE INDEX "Task_dispatchOrgId_idx" ON "Task"("dispatchOrgId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "TaskTarget_taskId_idx" ON "TaskTarget"("taskId");

-- CreateIndex
CREATE INDEX "TaskTarget_targetOrgId_idx" ON "TaskTarget"("targetOrgId");

-- CreateIndex
CREATE INDEX "TaskTarget_targetUserId_idx" ON "TaskTarget"("targetUserId");

-- CreateIndex
CREATE INDEX "TaskTarget_ownerUserId_idx" ON "TaskTarget"("ownerUserId");

-- CreateIndex
CREATE INDEX "TaskTarget_status_idx" ON "TaskTarget"("status");

-- CreateIndex
CREATE INDEX "TaskCollaborator_userId_idx" ON "TaskCollaborator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCollaborator_targetId_userId_key" ON "TaskCollaborator"("targetId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSubmission_targetId_key" ON "TaskSubmission"("targetId");

-- CreateIndex
CREATE INDEX "TaskSubmission_taskId_idx" ON "TaskSubmission"("taskId");

-- CreateIndex
CREATE INDEX "UnitTaskRouting_unitOrgId_idx" ON "UnitTaskRouting"("unitOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitTaskRouting_unitOrgId_sourceOrgId_key" ON "UnitTaskRouting"("unitOrgId", "sourceOrgId");
