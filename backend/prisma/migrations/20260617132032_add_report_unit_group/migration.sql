-- CreateTable
CREATE TABLE "ReportUnitGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgIdsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TEXT NOT NULL DEFAULT ''
);

-- CreateIndex
CREATE INDEX "ReportUnitGroup_userId_idx" ON "ReportUnitGroup"("userId");
