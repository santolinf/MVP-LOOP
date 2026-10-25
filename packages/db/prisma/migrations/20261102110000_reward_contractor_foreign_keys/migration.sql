-- B5: a reward must belong to real contractors at both ends. RESTRICT: erasure anonymises, it never deletes.
CREATE INDEX "Reward_qualifyingContractorId_idx" ON "Reward"("qualifyingContractorId");

ALTER TABLE "Reward" ADD CONSTRAINT "Reward_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_qualifyingContractorId_fkey" FOREIGN KEY ("qualifyingContractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
