-- AlterTable
ALTER TABLE "ReportLine" ADD COLUMN "spec" TEXT;
ALTER TABLE "ReportLine" ADD COLUMN "supplier" TEXT;

-- CreateIndex
CREATE INDEX "ReportLine_taskId_supplier_idx" ON "ReportLine"("taskId", "supplier");
