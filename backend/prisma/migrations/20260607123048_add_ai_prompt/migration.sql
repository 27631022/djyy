-- CreateTable
CREATE TABLE "AiPrompt" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
