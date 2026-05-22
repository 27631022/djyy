-- AlterTable
ALTER TABLE "User" ADD COLUMN "customFields" TEXT;

-- CreateTable
CREATE TABLE "UserCustomField" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCustomField_code_key" ON "UserCustomField"("code");

-- CreateIndex
CREATE INDEX "UserCustomField_active_sortOrder_idx" ON "UserCustomField"("active", "sortOrder");
