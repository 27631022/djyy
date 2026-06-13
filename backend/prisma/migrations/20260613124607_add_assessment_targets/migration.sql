-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentScheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "track" TEXT NOT NULL DEFAULT 'party',
    "targetLevel" TEXT NOT NULL DEFAULT 'committee',
    "indicatorsJson" TEXT NOT NULL DEFAULT '[]',
    "targetsJson" TEXT NOT NULL DEFAULT '[]',
    "gradeRulesJson" TEXT NOT NULL DEFAULT '{}',
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AssessmentScheme" ("createdAt", "createdById", "gradeRulesJson", "id", "indicatorsJson", "name", "settingsJson", "status", "targetLevel", "track", "updatedAt", "year") SELECT "createdAt", "createdById", "gradeRulesJson", "id", "indicatorsJson", "name", "settingsJson", "status", "targetLevel", "track", "updatedAt", "year" FROM "AssessmentScheme";
DROP TABLE "AssessmentScheme";
ALTER TABLE "new_AssessmentScheme" RENAME TO "AssessmentScheme";
CREATE INDEX "AssessmentScheme_year_idx" ON "AssessmentScheme"("year");
CREATE INDEX "AssessmentScheme_status_idx" ON "AssessmentScheme"("status");
CREATE INDEX "AssessmentScheme_targetLevel_idx" ON "AssessmentScheme"("targetLevel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
