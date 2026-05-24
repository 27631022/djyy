-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExternalApi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "apiKey" TEXT,
    "apiUrl" TEXT,
    "model" TEXT,
    "visionModel" TEXT,
    "rechargeUrl" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "capabilities" TEXT NOT NULL DEFAULT 'chat',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ExternalApi" ("active", "apiKey", "apiUrl", "createdAt", "description", "id", "meta", "model", "name", "provider", "rechargeUrl", "updatedAt") SELECT "active", "apiKey", "apiUrl", "createdAt", "description", "id", "meta", "model", "name", "provider", "rechargeUrl", "updatedAt" FROM "ExternalApi";
DROP TABLE "ExternalApi";
ALTER TABLE "new_ExternalApi" RENAME TO "ExternalApi";
CREATE UNIQUE INDEX "ExternalApi_provider_key" ON "ExternalApi"("provider");
CREATE INDEX "ExternalApi_active_idx" ON "ExternalApi"("active");
CREATE INDEX "ExternalApi_priority_idx" ON "ExternalApi"("priority");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
