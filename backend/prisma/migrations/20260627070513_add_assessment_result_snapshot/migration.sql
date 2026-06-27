-- CreateTable
CREATE TABLE "AssessmentResultSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "resultsJson" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentResultSnapshot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "AssessmentRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AssessmentResultSnapshot_roundId_idx" ON "AssessmentResultSnapshot"("roundId");
