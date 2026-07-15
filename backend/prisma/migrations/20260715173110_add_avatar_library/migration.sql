-- CreateTable
CREATE TABLE "AvatarLibraryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "thumbFileId" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'neutral',
    "source" TEXT NOT NULL DEFAULT 'upload',
    "configJson" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvatarLibraryItem_fileId_key" ON "AvatarLibraryItem"("fileId");

-- CreateIndex
CREATE INDEX "AvatarLibraryItem_createdAt_idx" ON "AvatarLibraryItem"("createdAt");
