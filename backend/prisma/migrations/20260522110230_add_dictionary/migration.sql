-- CreateTable
CREATE TABLE "Dictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DictItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dictId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DictItem_dictId_fkey" FOREIGN KEY ("dictId") REFERENCES "Dictionary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Dictionary_code_key" ON "Dictionary"("code");

-- CreateIndex
CREATE INDEX "Dictionary_active_idx" ON "Dictionary"("active");

-- CreateIndex
CREATE INDEX "DictItem_dictId_idx" ON "DictItem"("dictId");

-- CreateIndex
CREATE UNIQUE INDEX "DictItem_dictId_code_key" ON "DictItem"("dictId", "code");
