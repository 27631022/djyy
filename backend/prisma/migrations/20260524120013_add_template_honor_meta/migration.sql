-- AlterTable
ALTER TABLE "CertificateTemplate" ADD COLUMN "honorLevel" TEXT;
ALTER TABLE "CertificateTemplate" ADD COLUMN "honorType" TEXT;

-- 回填:已有模板默认 honorType='individual' + honorLevel='company',
-- 让发证页校验通过 + 管理员可在「证书模板」逐一改回准确值
UPDATE "CertificateTemplate" SET "honorType" = 'individual' WHERE "honorType" IS NULL;
UPDATE "CertificateTemplate" SET "honorLevel" = 'company' WHERE "honorLevel" IS NULL;
