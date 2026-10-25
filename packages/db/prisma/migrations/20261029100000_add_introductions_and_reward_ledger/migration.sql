-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'LINK',
ADD COLUMN     "lockedAt" TIMESTAMPTZ,
ADD COLUMN     "deviceHash" TEXT;

-- Introductions that already counted (referee live) are locked as at their creation.
UPDATE "Referral" r SET "lockedAt" = r."createdAt"
WHERE EXISTS (SELECT 1 FROM "Contractor" c WHERE c."id" = r."refereeId" AND c."live" = true);

-- CreateTable
CREATE TABLE "ReferralFlag" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ,
    "resolvedBy" TEXT,

    CONSTRAINT "ReferralFlag_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "assignmentId" TEXT,
ADD COLUMN     "supplyingCompany" TEXT,
ADD COLUMN     "serviceStart" DATE,
ADD COLUMN     "serviceEnd" DATE,
ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "agencyVerifiedAt" TIMESTAMPTZ,
ADD COLUMN     "approvedAt" TIMESTAMPTZ,
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "paidAt" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "Referral_referrerId_deviceHash_idx" ON "Referral"("referrerId", "deviceHash");

-- CreateIndex
CREATE INDEX "ReferralFlag_status_idx" ON "ReferralFlag"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralFlag_referralId_reason_key" ON "ReferralFlag"("referralId", "reason");
