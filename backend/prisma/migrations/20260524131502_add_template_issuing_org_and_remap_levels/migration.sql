-- AlterTable: 加落款单位字段
ALTER TABLE "CertificateTemplate" ADD COLUMN "issuingOrgName" TEXT;

-- honorLevel 字典化:旧 4 选(national/provincial/corporate/company)→ 新 3 选
-- (company/department/subsidiary)。统一把不在新枚举的值映射到 company,
-- 老 null 也填 company,保证发证页校验通过。
UPDATE "CertificateTemplate"
   SET "honorLevel" = 'company'
 WHERE "honorLevel" IS NULL
    OR "honorLevel" NOT IN ('company', 'department', 'subsidiary');
