-- CreateTable
CREATE TABLE "NavCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "bgLight" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NavItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NavItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NavCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NavCategory_code_key" ON "NavCategory"("code");

-- CreateIndex
CREATE INDEX "NavCategory_active_sortOrder_idx" ON "NavCategory"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "NavItem_categoryId_sortOrder_idx" ON "NavItem"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "NavItem_active_idx" ON "NavItem"("active");
