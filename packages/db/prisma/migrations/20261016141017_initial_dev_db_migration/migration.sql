-- CreateEnum
CREATE TYPE "EmploymentSituation" AS ENUM ('CONTRACTING', 'PERMANENT', 'BETWEEN_CONTRACTS');

-- CreateEnum
CREATE TYPE "ConfirmationSource" AS ENUM ('CV_PROFILE', 'SMS_REPLY', 'WEB', 'ADMIN_CALL');

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "employmentSituation" "EmploymentSituation",
    "availableFrom" DATE,
    "contractEndDate" DATE,
    "lastConfirmedAt" TIMESTAMPTZ,
    "confirmationSource" "ConfirmationSource",
    "live" BOOLEAN NOT NULL DEFAULT false,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "searchSuppressed" BOOLEAN NOT NULL DEFAULT false,
    "operationalSmsConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "searchColour" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionRun" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoundingCounter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "allocated" INTEGER NOT NULL DEFAULT 0,
    "cap" INTEGER NOT NULL DEFAULT 50000,

    CONSTRAINT "FoundingCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "qualifyingContractorId" TEXT NOT NULL,
    "amountPence" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_phone_key" ON "Contractor"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_email_key" ON "Contractor"("email");

-- CreateIndex
CREATE INDEX "ExtractionRun_contractorId_idx" ON "ExtractionRun"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_type_beneficiaryId_qualifyingContractorId_key" ON "Reward"("type", "beneficiaryId", "qualifyingContractorId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");
