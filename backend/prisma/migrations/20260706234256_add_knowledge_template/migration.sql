-- CreateTable
CREATE TABLE "KnowledgeTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contentMd" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeTemplate_createdAt_idx" ON "KnowledgeTemplate"("createdAt");
