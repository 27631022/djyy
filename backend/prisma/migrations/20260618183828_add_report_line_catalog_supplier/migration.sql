-- AlterTable
ALTER TABLE "ReportLine" ADD COLUMN "catalogSupplier" TEXT;

-- CreateIndex
CREATE INDEX "ReportLine_taskId_catalogSupplier_idx" ON "ReportLine"("taskId", "catalogSupplier");
