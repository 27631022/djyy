-- CreateTable
CREATE TABLE "ShowcaseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowcaseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseStage" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "intro" TEXT,
    "rulesMd" TEXT,
    "introBlocksJson" TEXT,
    "coverFileId" TEXT,
    "rankBy" TEXT NOT NULL DEFAULT 'likes',
    "metricLabel" TEXT,
    "metricUnit" TEXT,
    "metricDecimals" INTEGER NOT NULL DEFAULT 0,
    "metricOrder" TEXT NOT NULL DEFAULT 'desc',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rejectReason" TEXT,
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowcaseStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseEntry" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "coverFileId" TEXT,
    "blocksJson" TEXT NOT NULL DEFAULT '[]',
    "metricValue" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rejectReason" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowcaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseReaction" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'like',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowcaseReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseFeedback" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowcaseFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseFeedbackReply" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowcaseFeedbackReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseViewLog" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowcaseViewLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShowcaseCategory_sortOrder_idx" ON "ShowcaseCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "ShowcaseStage_categoryId_status_idx" ON "ShowcaseStage"("categoryId", "status");

-- CreateIndex
CREATE INDEX "ShowcaseStage_status_pinned_publishedAt_idx" ON "ShowcaseStage"("status", "pinned", "publishedAt");

-- CreateIndex
CREATE INDEX "ShowcaseStage_ownerId_status_idx" ON "ShowcaseStage"("ownerId", "status");

-- CreateIndex
CREATE INDEX "ShowcaseEntry_stageId_status_likeCount_idx" ON "ShowcaseEntry"("stageId", "status", "likeCount");

-- CreateIndex
CREATE INDEX "ShowcaseEntry_stageId_status_metricValue_idx" ON "ShowcaseEntry"("stageId", "status", "metricValue");

-- CreateIndex
CREATE INDEX "ShowcaseEntry_authorId_status_idx" ON "ShowcaseEntry"("authorId", "status");

-- CreateIndex
CREATE INDEX "ShowcaseReaction_targetType_targetId_type_idx" ON "ShowcaseReaction"("targetType", "targetId", "type");

-- CreateIndex
CREATE INDEX "ShowcaseReaction_userId_type_createdAt_idx" ON "ShowcaseReaction"("userId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShowcaseReaction_userId_targetType_targetId_type_key" ON "ShowcaseReaction"("userId", "targetType", "targetId", "type");

-- CreateIndex
CREATE INDEX "ShowcaseFeedback_targetType_targetId_status_idx" ON "ShowcaseFeedback"("targetType", "targetId", "status");

-- CreateIndex
CREATE INDEX "ShowcaseFeedback_status_createdAt_idx" ON "ShowcaseFeedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ShowcaseFeedbackReply_feedbackId_idx" ON "ShowcaseFeedbackReply"("feedbackId");

-- CreateIndex
CREATE INDEX "ShowcaseViewLog_targetType_targetId_createdAt_idx" ON "ShowcaseViewLog"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "ShowcaseViewLog_userId_createdAt_idx" ON "ShowcaseViewLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShowcaseStage" ADD CONSTRAINT "ShowcaseStage_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ShowcaseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseEntry" ADD CONSTRAINT "ShowcaseEntry_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ShowcaseStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseFeedbackReply" ADD CONSTRAINT "ShowcaseFeedbackReply_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "ShowcaseFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
