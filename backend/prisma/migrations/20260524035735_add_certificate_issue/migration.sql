-- AlterTable
ALTER TABLE "CertificateTemplate" ADD COLUMN "honorCode" TEXT;

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "certNo" TEXT NOT NULL,
    "yearLabel" TEXT NOT NULL,
    "honorCode" TEXT NOT NULL,
    "batchKey" TEXT NOT NULL,
    "batchTotal" INTEGER NOT NULL,
    "batchSeq" INTEGER NOT NULL,
    "publicToken" TEXT NOT NULL,
    "templateId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'internal',
    "recipientUserId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmpNo" TEXT,
    "recipientDept" TEXT,
    "recipientIdCard" TEXT,
    "recipientPhone" TEXT,
    "variableData" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME,
    "issuedBy" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "issuingOrgId" TEXT,
    "issuingOrgName" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" DATETIME,
    "revokedReason" TEXT,
    "revokedBy" TEXT,
    "pdfData" TEXT,
    "externalFileData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Certificate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CertificateTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Certificate_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_certNo_key" ON "Certificate"("certNo");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_publicToken_key" ON "Certificate"("publicToken");

-- CreateIndex
CREATE INDEX "Certificate_templateId_idx" ON "Certificate"("templateId");

-- CreateIndex
CREATE INDEX "Certificate_recipientUserId_idx" ON "Certificate"("recipientUserId");

-- CreateIndex
CREATE INDEX "Certificate_revoked_idx" ON "Certificate"("revoked");

-- CreateIndex
CREATE INDEX "Certificate_issueDate_idx" ON "Certificate"("issueDate");

-- CreateIndex
CREATE INDEX "Certificate_batchKey_idx" ON "Certificate"("batchKey");

-- CreateIndex
CREATE INDEX "Certificate_source_idx" ON "Certificate"("source");

-- CreateIndex
CREATE INDEX "Certificate_certNo_idx" ON "Certificate"("certNo");
