/*
  Warnings:

  - You are about to drop the column `handlerUserId` on the `UnitTaskRouting` table. All the data in the column will be lost.
  - Added the required column `handlerOrgId` to the `UnitTaskRouting` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TaskTarget" ADD COLUMN "handlerOrgId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UnitTaskRouting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitOrgId" TEXT NOT NULL,
    "sourceOrgId" TEXT NOT NULL,
    "handlerOrgId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UnitTaskRouting" ("createdAt", "createdById", "id", "sourceOrgId", "unitOrgId", "updatedAt") SELECT "createdAt", "createdById", "id", "sourceOrgId", "unitOrgId", "updatedAt" FROM "UnitTaskRouting";
DROP TABLE "UnitTaskRouting";
ALTER TABLE "new_UnitTaskRouting" RENAME TO "UnitTaskRouting";
CREATE INDEX "UnitTaskRouting_unitOrgId_idx" ON "UnitTaskRouting"("unitOrgId");
CREATE UNIQUE INDEX "UnitTaskRouting_unitOrgId_sourceOrgId_key" ON "UnitTaskRouting"("unitOrgId", "sourceOrgId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaskTarget_handlerOrgId_idx" ON "TaskTarget"("handlerOrgId");
