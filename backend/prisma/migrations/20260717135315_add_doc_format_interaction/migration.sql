-- CreateTable
CREATE TABLE "DocFormatFavorite" (
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocFormatFavorite_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DocFormatViewLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocFormatViewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocFormatFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL,
    "fileIds" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocFormatFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocFormatFeedbackReply" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocFormatFeedbackReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocFormatViewLog_createdAt_idx" ON "DocFormatViewLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocFormatViewLog_userId_bucket_key" ON "DocFormatViewLog"("userId", "bucket");

-- CreateIndex
CREATE INDEX "DocFormatFeedback_status_createdAt_idx" ON "DocFormatFeedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DocFormatFeedbackReply_feedbackId_idx" ON "DocFormatFeedbackReply"("feedbackId");

-- AddForeignKey
ALTER TABLE "DocFormatFeedbackReply" ADD CONSTRAINT "DocFormatFeedbackReply_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "DocFormatFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
