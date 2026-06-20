-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldsJson" TEXT NOT NULL DEFAULT '[]',
    "catalogTag" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReportTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "fieldsJson" TEXT NOT NULL DEFAULT '[]',
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

-- CreateTable
CREATE TABLE "ReportTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetOrgId" TEXT,
    "targetUserId" TEXT,
    "handlerOrgId" TEXT,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedById" TEXT,
    "assignedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReportRouting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "unitOrgId" TEXT NOT NULL,
    "handlerOrgId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReportSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "unitOrgId" TEXT,
    "unitName" TEXT,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "invoiceFileId" TEXT,
    "contractFileId" TEXT,
    "headData" TEXT NOT NULL DEFAULT '{}',
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

-- CreateTable
CREATE TABLE "ReportLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "orgId" TEXT,
    "lineNo" INTEGER NOT NULL,
    "catalogItemId" TEXT,
    "productName" TEXT NOT NULL,
    "category" TEXT,
    "categoryDesc" TEXT,
    "recommendOrg" TEXT,
    "origin" TEXT,
    "unitPriceCents" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "feeSource" TEXT NOT NULL,
    "qty" INTEGER,
    "extraJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "ReportLine_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ReportSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "catalogTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "columnsJson" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReportCatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "catalogTag" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "totalSeq" INTEGER,
    "subSeq" INTEGER,
    "productName" TEXT NOT NULL,
    "spec" TEXT,
    "purchasePriceCents" INTEGER,
    "taxRate" TEXT,
    "minOrderQty" TEXT,
    "contact" TEXT,
    "category" TEXT NOT NULL,
    "categoryDesc" TEXT,
    "supplier" TEXT,
    "recommendOrg" TEXT,
    "origin" TEXT,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "ReportCatalogItem_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "ReportCatalog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplate_code_key" ON "ReportTemplate"("code");

-- CreateIndex
CREATE INDEX "ReportTemplate_active_idx" ON "ReportTemplate"("active");

-- CreateIndex
CREATE INDEX "ReportTask_dispatchUserId_idx" ON "ReportTask"("dispatchUserId");

-- CreateIndex
CREATE INDEX "ReportTask_dispatchOrgId_idx" ON "ReportTask"("dispatchOrgId");

-- CreateIndex
CREATE INDEX "ReportTask_status_idx" ON "ReportTask"("status");

-- CreateIndex
CREATE INDEX "ReportTask_seriesId_idx" ON "ReportTask"("seriesId");

-- CreateIndex
CREATE INDEX "ReportTarget_taskId_idx" ON "ReportTarget"("taskId");

-- CreateIndex
CREATE INDEX "ReportTarget_targetOrgId_idx" ON "ReportTarget"("targetOrgId");

-- CreateIndex
CREATE INDEX "ReportTarget_targetUserId_idx" ON "ReportTarget"("targetUserId");

-- CreateIndex
CREATE INDEX "ReportTarget_handlerOrgId_idx" ON "ReportTarget"("handlerOrgId");

-- CreateIndex
CREATE INDEX "ReportTarget_ownerUserId_idx" ON "ReportTarget"("ownerUserId");

-- CreateIndex
CREATE INDEX "ReportTarget_status_idx" ON "ReportTarget"("status");

-- CreateIndex
CREATE INDEX "ReportRouting_unitOrgId_idx" ON "ReportRouting"("unitOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRouting_scope_unitOrgId_key" ON "ReportRouting"("scope", "unitOrgId");

-- CreateIndex
CREATE INDEX "ReportSubmission_taskId_idx" ON "ReportSubmission"("taskId");

-- CreateIndex
CREATE INDEX "ReportSubmission_targetId_idx" ON "ReportSubmission"("targetId");

-- CreateIndex
CREATE INDEX "ReportSubmission_status_idx" ON "ReportSubmission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSubmission_targetId_seq_key" ON "ReportSubmission"("targetId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSubmission_taskId_targetId_invoiceNo_key" ON "ReportSubmission"("taskId", "targetId", "invoiceNo");

-- CreateIndex
CREATE INDEX "ReportLine_submissionId_idx" ON "ReportLine"("submissionId");

-- CreateIndex
CREATE INDEX "ReportLine_taskId_orgId_idx" ON "ReportLine"("taskId", "orgId");

-- CreateIndex
CREATE INDEX "ReportLine_taskId_feeSource_idx" ON "ReportLine"("taskId", "feeSource");

-- CreateIndex
CREATE INDEX "ReportLine_taskId_category_idx" ON "ReportLine"("taskId", "category");

-- CreateIndex
CREATE INDEX "ReportLine_catalogItemId_idx" ON "ReportLine"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCatalog_catalogTag_key" ON "ReportCatalog"("catalogTag");

-- CreateIndex
CREATE INDEX "ReportCatalog_active_idx" ON "ReportCatalog"("active");

-- CreateIndex
CREATE INDEX "ReportCatalogItem_catalogTag_category_idx" ON "ReportCatalogItem"("catalogTag", "category");

-- CreateIndex
CREATE INDEX "ReportCatalogItem_catalogTag_productName_idx" ON "ReportCatalogItem"("catalogTag", "productName");
