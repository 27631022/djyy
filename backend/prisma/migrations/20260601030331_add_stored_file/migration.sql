-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

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
