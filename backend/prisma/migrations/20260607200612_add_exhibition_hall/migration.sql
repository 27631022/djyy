-- CreateTable
CREATE TABLE "Hall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "thumbnailFileId" TEXT,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "envModelFileId" TEXT,
    "wallsJson" TEXT NOT NULL DEFAULT '[]',
    "fixturesJson" TEXT NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Hall_published_idx" ON "Hall"("published");
