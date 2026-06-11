-- CreateTable
CREATE TABLE "ModelLibraryMeta" (
    "fileId" TEXT NOT NULL PRIMARY KEY,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
