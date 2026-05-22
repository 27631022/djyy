/*
  Warnings:

  - The primary key for the `UserRole` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `scopeOrgId` on the `UserRole` table. All the data in the column will be lost.
  - The required column `id` was added to the `UserRole` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateTable
CREATE TABLE "UserRoleScope" (
    "userRoleId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userRoleId", "orgId"),
    CONSTRAINT "UserRoleScope_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "UserRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRoleScope_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'self',
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserRole" ("grantedAt", "roleId", "scope", "userId") SELECT "grantedAt", "roleId", "scope", "userId" FROM "UserRole";
DROP TABLE "UserRole";
ALTER TABLE "new_UserRole" RENAME TO "UserRole";
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UserRoleScope_orgId_idx" ON "UserRoleScope"("orgId");
