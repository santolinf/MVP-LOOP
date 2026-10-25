-- B5: referral integrity and attribution evidence.
ALTER TABLE "Referral" ADD COLUMN "codeUsed" TEXT,
ADD COLUMN "ipHash" TEXT,
ADD COLUMN "userAgentHash" TEXT;

-- Best-effort backfill: earlier rows did not record the code, so use the introducer's current code.
UPDATE "Referral" r SET "codeUsed" = c."referralCode"
FROM "Contractor" c WHERE c."id" = r."referrerId" AND r."codeUsed" IS NULL;

-- Nobody can introduce themselves (also enforced in the domain rule).
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_no_self_referral" CHECK ("referrerId" <> "refereeId");

-- Both ends must be real contractors. RESTRICT: erasure anonymises the row, it never deletes it.
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
