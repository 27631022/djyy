-- CreateTable
CREATE TABLE "CertificateTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "designJson" TEXT NOT NULL,
    "thumbnail" TEXT,
    "width" INTEGER NOT NULL DEFAULT 800,
    "height" INTEGER NOT NULL DEFAULT 566,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT
);

-- CreateIndex
CREATE INDEX "CertificateTemplate_active_idx" ON "CertificateTemplate"("active");

-- CreateIndex
CREATE INDEX "CertificateTemplate_category_idx" ON "CertificateTemplate"("category");
