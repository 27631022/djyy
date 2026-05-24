-- CreateTable
CREATE TABLE "ExternalApi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "apiKey" TEXT,
    "apiUrl" TEXT,
    "model" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalApi_provider_key" ON "ExternalApi"("provider");

-- CreateIndex
CREATE INDEX "ExternalApi_active_idx" ON "ExternalApi"("active");
