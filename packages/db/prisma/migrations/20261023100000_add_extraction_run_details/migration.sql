-- AlterTable
ALTER TABLE "ExtractionRun" ADD COLUMN "cvUploadId" TEXT NOT NULL,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "error" TEXT,
ADD COLUMN "completedAt" TIMESTAMPTZ,
ALTER COLUMN "contractorId" DROP NOT NULL,
ALTER COLUMN "fields" SET DEFAULT '[]';

-- CreateTable
CREATE TABLE "ConfirmedProfileField" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "extractionRunId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ConfirmedProfileField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionRun_cvUploadId_key" ON "ExtractionRun"("cvUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmedProfileField_extractionRunId_fieldId_key" ON "ConfirmedProfileField"("extractionRunId", "fieldId");

-- CreateIndex
CREATE INDEX "ConfirmedProfileField_contractorId_idx" ON "ConfirmedProfileField"("contractorId");
