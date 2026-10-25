-- AlterTable
ALTER TABLE "ConfirmedProfileField" ADD COLUMN "draftId" TEXT,
ALTER COLUMN "contractorId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ConfirmedProfileField_draftId_idx" ON "ConfirmedProfileField"("draftId");
