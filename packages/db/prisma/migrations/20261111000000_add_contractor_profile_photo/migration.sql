-- Contractor profile photograph (QA-005). The image itself lives in the private object store; only its key and
-- verified type are stored here. Nullable: existing contractors simply have no photograph.
ALTER TABLE "Contractor" ADD COLUMN "photoKey" TEXT;
ALTER TABLE "Contractor" ADD COLUMN "photoContentType" TEXT;
ALTER TABLE "Contractor" ADD COLUMN "photoUpdatedAt" TIMESTAMPTZ;
