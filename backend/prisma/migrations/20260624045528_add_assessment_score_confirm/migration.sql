-- CreateTable
CREATE TABLE "AssessmentScoreConfirm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "leafCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssessmentScoreConfirm_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "AssessmentRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AssessmentScoreConfirm_roundId_idx" ON "AssessmentScoreConfirm"("roundId");

-- CreateIndex
CREATE INDEX "AssessmentScoreConfirm_userId_idx" ON "AssessmentScoreConfirm"("userId");

-- CreateIndex
CREATE INDEX "AssessmentScoreConfirm_status_idx" ON "AssessmentScoreConfirm"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentScoreConfirm_roundId_leafCode_userId_key" ON "AssessmentScoreConfirm"("roundId", "leafCode", "userId");
