-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DictItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dictId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DictItem_dictId_fkey" FOREIGN KEY ("dictId") REFERENCES "Dictionary" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DictItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DictItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DictItem" ("active", "code", "createdAt", "description", "dictId", "id", "label", "sortOrder", "updatedAt") SELECT "active", "code", "createdAt", "description", "dictId", "id", "label", "sortOrder", "updatedAt" FROM "DictItem";
DROP TABLE "DictItem";
ALTER TABLE "new_DictItem" RENAME TO "DictItem";
CREATE INDEX "DictItem_dictId_idx" ON "DictItem"("dictId");
CREATE INDEX "DictItem_parentId_idx" ON "DictItem"("parentId");
CREATE UNIQUE INDEX "DictItem_dictId_code_key" ON "DictItem"("dictId", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
