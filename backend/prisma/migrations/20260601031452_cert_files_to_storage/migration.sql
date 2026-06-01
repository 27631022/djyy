/*
  Warnings:

  - You are about to drop the column `externalFileData` on the `Certificate` table. All the data in the column will be lost.
  - You are about to drop the column `pdfData` on the `Certificate` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Certificate" (
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
    "honorType" TEXT,
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
    "pdfFileId" TEXT,
    "sourceFileId" TEXT,
    "thumbnail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Certificate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CertificateTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Certificate_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Certificate" ("batchKey", "batchSeq", "batchTotal", "certNo", "createdAt", "honorCode", "honorType", "id", "issueDate", "issuedBy", "issuerName", "issuingOrgId", "issuingOrgName", "publicToken", "recipientDept", "recipientEmpNo", "recipientIdCard", "recipientName", "recipientPhone", "recipientUserId", "revoked", "revokedAt", "revokedBy", "revokedReason", "source", "templateId", "thumbnail", "updatedAt", "validUntil", "variableData", "yearLabel") SELECT "batchKey", "batchSeq", "batchTotal", "certNo", "createdAt", "honorCode", "honorType", "id", "issueDate", "issuedBy", "issuerName", "issuingOrgId", "issuingOrgName", "publicToken", "recipientDept", "recipientEmpNo", "recipientIdCard", "recipientName", "recipientPhone", "recipientUserId", "revoked", "revokedAt", "revokedBy", "revokedReason", "source", "templateId", "thumbnail", "updatedAt", "validUntil", "variableData", "yearLabel" FROM "Certificate";
DROP TABLE "Certificate";
ALTER TABLE "new_Certificate" RENAME TO "Certificate";
CREATE UNIQUE INDEX "Certificate_certNo_key" ON "Certificate"("certNo");
CREATE UNIQUE INDEX "Certificate_publicToken_key" ON "Certificate"("publicToken");
CREATE INDEX "Certificate_templateId_idx" ON "Certificate"("templateId");
CREATE INDEX "Certificate_recipientUserId_idx" ON "Certificate"("recipientUserId");
CREATE INDEX "Certificate_revoked_idx" ON "Certificate"("revoked");
CREATE INDEX "Certificate_issueDate_idx" ON "Certificate"("issueDate");
CREATE INDEX "Certificate_batchKey_idx" ON "Certificate"("batchKey");
CREATE INDEX "Certificate_source_idx" ON "Certificate"("source");
CREATE INDEX "Certificate_certNo_idx" ON "Certificate"("certNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
