-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "wordingVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ipHash" TEXT,
    "grantedAt" TIMESTAMPTZ NOT NULL,
    "withdrawnAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_contractorId_purpose_grantedAt_idx" ON "ConsentRecord"("contractorId", "purpose", "grantedAt");

-- At most one active (not withdrawn) grant per contractor and purpose, so parallel requests cannot double-grant.
CREATE UNIQUE INDEX "ConsentRecord_one_active_per_purpose" ON "ConsentRecord"("contractorId", "purpose") WHERE "withdrawnAt" IS NULL;

-- Carry existing marketing opt-ins across. The wording they agreed to predates versioning.
INSERT INTO "ConsentRecord" ("id", "contractorId", "purpose", "wordingVersion", "source", "grantedAt")
SELECT gen_random_uuid()::text, "id", 'LOOP_MARKETING', 'pre-v1', 'WEB', "createdAt"
FROM "Contractor" WHERE "marketingConsent" = true;
