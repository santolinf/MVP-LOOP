-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "foundingPlace" INTEGER;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_referralCode_key" ON "Contractor"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_foundingPlace_key" ON "Contractor"("foundingPlace");
