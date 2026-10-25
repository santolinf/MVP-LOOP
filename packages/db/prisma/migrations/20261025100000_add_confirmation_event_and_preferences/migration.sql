-- Replace ConfirmationSource with the Phase 5 values (WEB | APP | EMAIL_LINK | ADMIN).
-- Mapping: SMS_REPLY -> EMAIL_LINK, ADMIN_CALL -> ADMIN, CV_PROFILE -> WEB.
CREATE TYPE "ConfirmationSource_new" AS ENUM ('WEB', 'APP', 'EMAIL_LINK', 'ADMIN');

ALTER TABLE "Contractor"
  ALTER COLUMN "confirmationSource" TYPE "ConfirmationSource_new"
  USING (
    CASE
      WHEN "confirmationSource" IS NULL THEN NULL
      WHEN "confirmationSource"::text = 'SMS_REPLY' THEN 'EMAIL_LINK'
      WHEN "confirmationSource"::text = 'ADMIN_CALL' THEN 'ADMIN'
      ELSE 'WEB'
    END
  )::"ConfirmationSource_new";

DROP TYPE "ConfirmationSource";
ALTER TYPE "ConfirmationSource_new" RENAME TO "ConfirmationSource";

-- CreateTable
CREATE TABLE "ConfirmationEvent" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "source" "ConfirmationSource" NOT NULL,
    "employmentSituation" "EmploymentSituation" NOT NULL,
    "availableFrom" DATE,
    "contractEndDate" DATE,
    "confirmedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorPreferences" (
    "contractorId" TEXT NOT NULL,
    "workTypes" TEXT[],
    "rateBand" TEXT,
    "remote" TEXT,
    "regions" TEXT[],
    "sectors" TEXT[],
    "noticePeriod" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ContractorPreferences_pkey" PRIMARY KEY ("contractorId")
);

-- CreateIndex
CREATE INDEX "ConfirmationEvent_contractorId_confirmedAt_idx" ON "ConfirmationEvent"("contractorId", "confirmedAt");
