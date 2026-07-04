-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    "isDept" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "externalId" TEXT,
    "customFields" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOrganization" (
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOrganization_pkey" PRIMARY KEY ("userId","orgId")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'self',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleScope" (
    "userRoleId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleScope_pkey" PRIMARY KEY ("userRoleId","orgId")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "pluginName" TEXT,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Dictionary" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictItem" (
    "id" TEXT NOT NULL,
    "dictId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCustomField" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dictCode" TEXT,
    "placeholder" TEXT,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NavCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "bgLight" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NavItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "url" TEXT,
    "common" BOOLEAN NOT NULL DEFAULT false,
    "desc" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "pluginName" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalApi" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'cloud',
    "iconRef" TEXT,
    "apiKey" TEXT,
    "apiUrl" TEXT,
    "model" TEXT,
    "visionModel" TEXT,
    "imageModel" TEXT,
    "model3d" TEXT,
    "ttsModel" TEXT,
    "ttsVoice" TEXT,
    "rechargeUrl" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "capabilities" TEXT NOT NULL DEFAULT 'chat',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalApi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRoute" (
    "id" TEXT NOT NULL,
    "consumerKey" TEXT NOT NULL,
    "provider" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPrompt" (
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPrompt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IconAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IconAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "honorCode" TEXT,
    "honorType" TEXT,
    "honorLevel" TEXT,
    "issuingOrgName" TEXT,
    "designJson" TEXT NOT NULL,
    "thumbnail" TEXT,
    "width" INTEGER NOT NULL DEFAULT 800,
    "height" INTEGER NOT NULL DEFAULT 566,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "CertificateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "certNo" TEXT NOT NULL,
    "yearLabel" TEXT NOT NULL,
    "honorCode" TEXT NOT NULL,
    "batchKey" TEXT NOT NULL,
    "batchTotal" INTEGER NOT NULL,
    "batchSeq" INTEGER NOT NULL,
    "publicToken" TEXT NOT NULL,
    "templateId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'internal',
    "honorType" TEXT,
    "recipientUserId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmpNo" TEXT,
    "recipientDept" TEXT,
    "recipientIdCard" TEXT,
    "recipientPhone" TEXT,
    "variableData" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "issuedBy" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "issuingOrgId" TEXT,
    "issuingOrgName" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "revokedBy" TEXT,
    "pdfFileId" TEXT,
    "sourceFileId" TEXT,
    "thumbnail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "ownerModule" TEXT NOT NULL,
    "folder" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "ext" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "fields" TEXT NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "templateId" TEXT,
    "fields" TEXT NOT NULL,
    "dispatchUserId" TEXT NOT NULL,
    "dispatchOrgId" TEXT,
    "dueAt" TIMESTAMP(3),
    "noticeFileId" TEXT,
    "noticeFileName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "seriesId" TEXT,
    "periodLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTarget" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetOrgId" TEXT,
    "targetUserId" TEXT,
    "ownerUserId" TEXT,
    "handlerOrgId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "confirmStatus" TEXT NOT NULL DEFAULT 'none',
    "senderConfirm" TEXT,
    "senderConfirmById" TEXT,
    "receiverConfirm" TEXT,
    "receiverConfirmById" TEXT,
    "confirmNote" TEXT,
    "confirmActedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCollaborator" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "formData" TEXT NOT NULL DEFAULT '{}',
    "fileIds" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "returnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitTaskRouting" (
    "id" TEXT NOT NULL,
    "unitOrgId" TEXT NOT NULL,
    "sourceOrgId" TEXT NOT NULL,
    "handlerOrgId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitTaskRouting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hall" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thumbnailFileId" TEXT,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "envModelFileId" TEXT,
    "wallsJson" TEXT NOT NULL DEFAULT '[]',
    "fixturesJson" TEXT NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelLibraryMeta" (
    "fileId" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelLibraryMeta_pkey" PRIMARY KEY ("fileId")
);

-- CreateTable
CREATE TABLE "ExhibitionGuidePreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExhibitionGuidePreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "photoFileIds" TEXT,
    "facilities" TEXT,
    "orgId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueLayout" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layoutJson" TEXT NOT NULL,
    "thumbnail" TEXT,
    "width" INTEGER NOT NULL DEFAULT 1200,
    "height" INTEGER NOT NULL DEFAULT 800,
    "gridSize" INTEGER NOT NULL DEFAULT 20,
    "seatCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatingPlan" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "rosterJson" TEXT NOT NULL DEFAULT '[]',
    "rulesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "layoutSnapshotJson" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatingAssignment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "attendeeId" TEXT,
    "attendeeName" TEXT,
    "unit" TEXT,
    "position" TEXT,
    "score" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyAdminLink" (
    "id" TEXT NOT NULL,
    "partyOrgId" TEXT NOT NULL,
    "adminOrgId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyAdminLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentScheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "track" TEXT NOT NULL DEFAULT 'party',
    "targetLevel" TEXT NOT NULL DEFAULT 'committee',
    "indicatorsJson" TEXT NOT NULL DEFAULT '[]',
    "targetsJson" TEXT NOT NULL DEFAULT '[]',
    "gradeRulesJson" TEXT NOT NULL DEFAULT '{}',
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentRound" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "track" TEXT NOT NULL DEFAULT 'party',
    "indicatorsJson" TEXT NOT NULL DEFAULT '[]',
    "targetsJson" TEXT NOT NULL DEFAULT '[]',
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "gradeRulesJson" TEXT NOT NULL DEFAULT '{}',
    "resultsJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentScoreConfirm" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "leafCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentScoreConfirm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicatorScore" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "leafCode" TEXT NOT NULL,
    "rawValue" TEXT,
    "note" TEXT,
    "evidenceFileIds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicatorScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResultSnapshot" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "resultsJson" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentResultSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldsJson" TEXT NOT NULL DEFAULT '[]',
    "catalogTag" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "fieldsJson" TEXT NOT NULL DEFAULT '[]',
    "goalsJson" TEXT NOT NULL DEFAULT '[]',
    "catalogTag" TEXT,
    "dispatchUserId" TEXT NOT NULL,
    "dispatchOrgId" TEXT,
    "dueAt" TIMESTAMP(3),
    "noticeFileId" TEXT,
    "noticeFileName" TEXT,
    "seriesId" TEXT,
    "periodLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTarget" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetOrgId" TEXT,
    "targetUserId" TEXT,
    "handlerOrgId" TEXT,
    "ownerUserId" TEXT,
    "goalTargetsJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRouting" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "unitOrgId" TEXT NOT NULL,
    "handlerOrgId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportRouting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "unitOrgId" TEXT,
    "unitName" TEXT,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "invoiceFileId" TEXT,
    "contractFileId" TEXT,
    "headData" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "returnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportLine" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "orgId" TEXT,
    "lineNo" INTEGER NOT NULL,
    "catalogItemId" TEXT,
    "productName" TEXT NOT NULL,
    "spec" TEXT,
    "category" TEXT,
    "categoryDesc" TEXT,
    "recommendOrg" TEXT,
    "origin" TEXT,
    "catalogSupplier" TEXT,
    "unitPriceCents" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "feeSource" TEXT NOT NULL,
    "supplier" TEXT,
    "qty" INTEGER,
    "extraJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "ReportLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCatalog" (
    "id" TEXT NOT NULL,
    "catalogTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "columnsJson" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCatalogItem" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "ReportCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportUnitGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgIdsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ReportUnitGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "Organization_kind_idx" ON "Organization"("kind");

-- CreateIndex
CREATE INDEX "Organization_isVirtual_idx" ON "Organization"("isVirtual");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

-- CreateIndex
CREATE INDEX "UserOrganization_orgId_idx" ON "UserOrganization"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "UserRoleScope_orgId_idx" ON "UserRoleScope"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Dictionary_code_key" ON "Dictionary"("code");

-- CreateIndex
CREATE INDEX "Dictionary_active_idx" ON "Dictionary"("active");

-- CreateIndex
CREATE INDEX "DictItem_dictId_idx" ON "DictItem"("dictId");

-- CreateIndex
CREATE INDEX "DictItem_parentId_idx" ON "DictItem"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "DictItem_dictId_code_key" ON "DictItem"("dictId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UserCustomField_code_key" ON "UserCustomField"("code");

-- CreateIndex
CREATE INDEX "UserCustomField_active_sortOrder_idx" ON "UserCustomField"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "NavCategory_code_key" ON "NavCategory"("code");

-- CreateIndex
CREATE INDEX "NavCategory_active_sortOrder_idx" ON "NavCategory"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "NavItem_categoryId_sortOrder_idx" ON "NavItem"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "NavItem_active_idx" ON "NavItem"("active");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_pluginName_idx" ON "AuditLog"("pluginName");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalApi_provider_key" ON "ExternalApi"("provider");

-- CreateIndex
CREATE INDEX "ExternalApi_active_idx" ON "ExternalApi"("active");

-- CreateIndex
CREATE INDEX "ExternalApi_priority_idx" ON "ExternalApi"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "AiRoute_consumerKey_key" ON "AiRoute"("consumerKey");

-- CreateIndex
CREATE INDEX "CertificateTemplate_active_idx" ON "CertificateTemplate"("active");

-- CreateIndex
CREATE INDEX "CertificateTemplate_category_idx" ON "CertificateTemplate"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_certNo_key" ON "Certificate"("certNo");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_publicToken_key" ON "Certificate"("publicToken");

-- CreateIndex
CREATE INDEX "Certificate_templateId_idx" ON "Certificate"("templateId");

-- CreateIndex
CREATE INDEX "Certificate_recipientUserId_idx" ON "Certificate"("recipientUserId");

-- CreateIndex
CREATE INDEX "Certificate_revoked_idx" ON "Certificate"("revoked");

-- CreateIndex
CREATE INDEX "Certificate_issueDate_idx" ON "Certificate"("issueDate");

-- CreateIndex
CREATE INDEX "Certificate_batchKey_idx" ON "Certificate"("batchKey");

-- CreateIndex
CREATE INDEX "Certificate_source_idx" ON "Certificate"("source");

-- CreateIndex
CREATE INDEX "Certificate_certNo_idx" ON "Certificate"("certNo");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "StoredFile_ownerModule_idx" ON "StoredFile"("ownerModule");

-- CreateIndex
CREATE INDEX "StoredFile_folder_idx" ON "StoredFile"("folder");

-- CreateIndex
CREATE INDEX "StoredFile_sha256_idx" ON "StoredFile"("sha256");

-- CreateIndex
CREATE INDEX "StoredFile_deletedAt_idx" ON "StoredFile"("deletedAt");

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
CREATE INDEX "Task_seriesId_idx" ON "Task"("seriesId");

-- CreateIndex
CREATE INDEX "TaskTarget_taskId_idx" ON "TaskTarget"("taskId");

-- CreateIndex
CREATE INDEX "TaskTarget_targetOrgId_idx" ON "TaskTarget"("targetOrgId");

-- CreateIndex
CREATE INDEX "TaskTarget_targetUserId_idx" ON "TaskTarget"("targetUserId");

-- CreateIndex
CREATE INDEX "TaskTarget_ownerUserId_idx" ON "TaskTarget"("ownerUserId");

-- CreateIndex
CREATE INDEX "TaskTarget_handlerOrgId_idx" ON "TaskTarget"("handlerOrgId");

-- CreateIndex
CREATE INDEX "TaskTarget_status_idx" ON "TaskTarget"("status");

-- CreateIndex
CREATE INDEX "TaskTarget_confirmStatus_idx" ON "TaskTarget"("confirmStatus");

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

-- CreateIndex
CREATE INDEX "Hall_published_idx" ON "Hall"("published");

-- CreateIndex
CREATE INDEX "MeetingRoom_active_idx" ON "MeetingRoom"("active");

-- CreateIndex
CREATE INDEX "MeetingRoom_orgId_idx" ON "MeetingRoom"("orgId");

-- CreateIndex
CREATE INDEX "VenueLayout_roomId_idx" ON "VenueLayout"("roomId");

-- CreateIndex
CREATE INDEX "VenueLayout_active_idx" ON "VenueLayout"("active");

-- CreateIndex
CREATE INDEX "SeatingPlan_layoutId_idx" ON "SeatingPlan"("layoutId");

-- CreateIndex
CREATE INDEX "SeatingPlan_status_idx" ON "SeatingPlan"("status");

-- CreateIndex
CREATE INDEX "SeatingAssignment_planId_idx" ON "SeatingAssignment"("planId");

-- CreateIndex
CREATE INDEX "SeatingAssignment_unit_idx" ON "SeatingAssignment"("unit");

-- CreateIndex
CREATE INDEX "SeatingAssignment_position_idx" ON "SeatingAssignment"("position");

-- CreateIndex
CREATE INDEX "SeatingAssignment_attendeeId_idx" ON "SeatingAssignment"("attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatingAssignment_planId_seatId_key" ON "SeatingAssignment"("planId", "seatId");

-- CreateIndex
CREATE INDEX "PartyAdminLink_partyOrgId_idx" ON "PartyAdminLink"("partyOrgId");

-- CreateIndex
CREATE INDEX "PartyAdminLink_adminOrgId_idx" ON "PartyAdminLink"("adminOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyAdminLink_partyOrgId_adminOrgId_key" ON "PartyAdminLink"("partyOrgId", "adminOrgId");

-- CreateIndex
CREATE INDEX "AssessmentScheme_year_idx" ON "AssessmentScheme"("year");

-- CreateIndex
CREATE INDEX "AssessmentScheme_status_idx" ON "AssessmentScheme"("status");

-- CreateIndex
CREATE INDEX "AssessmentScheme_targetLevel_idx" ON "AssessmentScheme"("targetLevel");

-- CreateIndex
CREATE INDEX "AssessmentRound_schemeId_idx" ON "AssessmentRound"("schemeId");

-- CreateIndex
CREATE INDEX "AssessmentRound_year_idx" ON "AssessmentRound"("year");

-- CreateIndex
CREATE INDEX "AssessmentRound_status_idx" ON "AssessmentRound"("status");

-- CreateIndex
CREATE INDEX "AssessmentScoreConfirm_roundId_idx" ON "AssessmentScoreConfirm"("roundId");

-- CreateIndex
CREATE INDEX "AssessmentScoreConfirm_userId_idx" ON "AssessmentScoreConfirm"("userId");

-- CreateIndex
CREATE INDEX "AssessmentScoreConfirm_status_idx" ON "AssessmentScoreConfirm"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentScoreConfirm_roundId_leafCode_userId_key" ON "AssessmentScoreConfirm"("roundId", "leafCode", "userId");

-- CreateIndex
CREATE INDEX "IndicatorScore_roundId_idx" ON "IndicatorScore"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorScore_roundId_targetRef_leafCode_key" ON "IndicatorScore"("roundId", "targetRef", "leafCode");

-- CreateIndex
CREATE INDEX "AssessmentResultSnapshot_roundId_idx" ON "AssessmentResultSnapshot"("roundId");

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
CREATE INDEX "ReportLine_taskId_supplier_idx" ON "ReportLine"("taskId", "supplier");

-- CreateIndex
CREATE INDEX "ReportLine_taskId_catalogSupplier_idx" ON "ReportLine"("taskId", "catalogSupplier");

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

-- CreateIndex
CREATE INDEX "ReportUnitGroup_userId_idx" ON "ReportUnitGroup"("userId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleScope" ADD CONSTRAINT "UserRoleScope_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "UserRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleScope" ADD CONSTRAINT "UserRoleScope_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictItem" ADD CONSTRAINT "DictItem_dictId_fkey" FOREIGN KEY ("dictId") REFERENCES "Dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictItem" ADD CONSTRAINT "DictItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DictItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavItem" ADD CONSTRAINT "NavItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NavCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CertificateTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueLayout" ADD CONSTRAINT "VenueLayout_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MeetingRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingPlan" ADD CONSTRAINT "SeatingPlan_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "VenueLayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingAssignment" ADD CONSTRAINT "SeatingAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SeatingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScoreConfirm" ADD CONSTRAINT "AssessmentScoreConfirm_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "AssessmentRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorScore" ADD CONSTRAINT "IndicatorScore_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "AssessmentRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResultSnapshot" ADD CONSTRAINT "AssessmentResultSnapshot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "AssessmentRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportLine" ADD CONSTRAINT "ReportLine_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ReportSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCatalogItem" ADD CONSTRAINT "ReportCatalogItem_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "ReportCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
