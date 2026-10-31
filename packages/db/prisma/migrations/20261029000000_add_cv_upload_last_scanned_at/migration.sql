-- AlterTable
ALTER TABLE "CvUpload" ADD COLUMN "lastScannedAt" TIMESTAMPTZ;

-- Existing promoted files were scanned when they were completed.
UPDATE "CvUpload" SET "lastScannedAt" = "completedAt" WHERE "status" = 'READY';

-- CreateIndex
CREATE INDEX "CvUpload_status_lastScannedAt_idx" ON "CvUpload"("status", "lastScannedAt");
