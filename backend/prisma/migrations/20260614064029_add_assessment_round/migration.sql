-- CreateTable
CREATE TABLE "AssessmentRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "track" TEXT NOT NULL DEFAULT 'party',
    "indicatorsJson" TEXT NOT NULL DEFAULT '[]',
    "targetsJson" TEXT NOT NULL DEFAULT '[]',
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "gradeRulesJson" TEXT NOT NULL DEFAULT '{}',
    "resultsJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IndicatorScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "leafCode" TEXT NOT NULL,
    "rawValue" TEXT,
    "note" TEXT,
    "evidenceFileIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IndicatorScore_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "AssessmentRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AssessmentRound_schemeId_idx" ON "AssessmentRound"("schemeId");

-- CreateIndex
CREATE INDEX "AssessmentRound_year_idx" ON "AssessmentRound"("year");

-- CreateIndex
CREATE INDEX "AssessmentRound_status_idx" ON "AssessmentRound"("status");

-- CreateIndex
CREATE INDEX "IndicatorScore_roundId_idx" ON "IndicatorScore"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorScore_roundId_targetRef_leafCode_key" ON "IndicatorScore"("roundId", "targetRef", "leafCode");
