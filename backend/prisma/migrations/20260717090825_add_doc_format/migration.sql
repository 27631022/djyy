-- CreateTable
CREATE TABLE "DocFormatTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "builtinKey" TEXT,
    "configJson" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocFormatTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocFormatTemplate_builtinKey_key" ON "DocFormatTemplate"("builtinKey");

-- CreateIndex
CREATE INDEX "DocFormatTemplate_isDefault_idx" ON "DocFormatTemplate"("isDefault");
