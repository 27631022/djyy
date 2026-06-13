-- CreateTable
CREATE TABLE "PartyAdminLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partyOrgId" TEXT NOT NULL,
    "adminOrgId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AssessmentScheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "track" TEXT NOT NULL DEFAULT 'party',
    "targetLevel" TEXT NOT NULL DEFAULT 'committee',
    "indicatorsJson" TEXT NOT NULL DEFAULT '[]',
    "gradeRulesJson" TEXT NOT NULL DEFAULT '{}',
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PartyAdminLink_partyOrgId_idx" ON "PartyAdminLink"("partyOrgId");

-- CreateIndex
CREATE INDEX "PartyAdminLink_adminOrgId_idx" ON "PartyAdminLink"("adminOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyAdminLink_partyOrgId_adminOrgId_key" ON "PartyAdminLink"("partyOrgId", "adminOrgId");

-- CreateIndex
CREATE INDEX "AssessmentScheme_year_idx" ON "AssessmentScheme"("year");

-- CreateIndex
CREATE INDEX "AssessmentScheme_status_idx" ON "AssessmentScheme"("status");

-- CreateIndex
CREATE INDEX "AssessmentScheme_targetLevel_idx" ON "AssessmentScheme"("targetLevel");
