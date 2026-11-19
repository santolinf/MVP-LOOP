-- Desktop profile: contractor-written professional summary and qualifications. Nullable and additive, so existing
-- rows and older clients (which never send them) are unaffected.
ALTER TABLE "ContractorProfileDetails" ADD COLUMN "summary" TEXT;
ALTER TABLE "ContractorProfileDetails" ADD COLUMN "qualifications" TEXT;
