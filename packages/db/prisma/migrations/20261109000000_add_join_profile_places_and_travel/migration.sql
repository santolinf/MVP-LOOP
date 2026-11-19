-- Structured additional towns/cities (QA-014) and the occasional-travel answer. Existing rows keep their legacy
-- free-text `otherLocations`; the API derives places from it on read, so nothing is discarded.
ALTER TABLE "ContractorJoinProfile" ADD COLUMN "otherPlaces" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ContractorJoinProfile" ADD COLUMN "occasionalTravel" TEXT;
