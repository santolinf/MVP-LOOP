-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmploymentSituation" AS ENUM ('CONTRACTING', 'PERMANENT', 'BETWEEN_CONTRACTS');

-- CreateEnum
CREATE TYPE "ConfirmationSource" AS ENUM ('WEB', 'APP', 'EMAIL_LINK', 'ADMIN');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'SIGN_IN');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('WEB', 'MOBILE_APP');

-- CreateEnum
CREATE TYPE "AppPlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateTable
CREATE TABLE "EmailOtp" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ,
    "clientType" "ClientType" NOT NULL,
    "requestIp" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "clientType" "ClientType" NOT NULL,
    "appPlatform" "AppPlatform",
    "attestationVerified" BOOLEAN NOT NULL DEFAULT false,
    "refreshTokenHash" TEXT,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "lastUsedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

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
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "searchColour" TEXT,
    "underlyingStatus" TEXT,
    "freshnessState" TEXT,
    "confirmationChannel" TEXT,
    "unconfirmedSince" TIMESTAMPTZ,
    "escalationStage" TEXT,
    "referralCode" TEXT,
    "foundingPlace" INTEGER,
    "firstAppSignInAt" TIMESTAMPTZ,
    "firstAppSignInSessionId" TEXT,
    "erasureRequestedAt" TIMESTAMPTZ,
    "erasedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "ReminderConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ReminderConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'LINK',
    "lockedAt" TIMESTAMPTZ,
    "deviceHash" TEXT,
    "codeUsed" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "ExtractionRun" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT,
    "cvUploadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmedProfileField" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT,
    "draftId" TEXT,
    "extractionRunId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ConfirmedProfileField_pkey" PRIMARY KEY ("id")
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
    "assignmentId" TEXT,
    "supplyingCompany" TEXT,
    "serviceStart" DATE,
    "serviceEnd" DATE,
    "evidence" JSONB,
    "agencyVerifiedAt" TIMESTAMPTZ,
    "approvedAt" TIMESTAMPTZ,
    "approvedBy" TEXT,
    "paidAt" TIMESTAMPTZ,
    "verificationRecordedBy" TEXT,
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
    "actorType" TEXT NOT NULL DEFAULT 'CONTRACTOR',
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

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "scope" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("scope","keyHash","windowStart")
);

-- CreateTable
CREATE TABLE "EligibilityDeclaration" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT,
    "draftId" TEXT,
    "ukBased" BOOLEAN NOT NULL,
    "rightToWork" BOOLEAN NOT NULL,
    "wordingVersion" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibilityDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadDraft" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipHash" TEXT,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "adoptedById" TEXT,
    "adoptedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvUpload" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT,
    "draftId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "declaredMime" TEXT NOT NULL,
    "declaredSize" INTEGER NOT NULL,
    "sizeBytes" INTEGER,
    "detectedType" TEXT,
    "quarantineKey" TEXT NOT NULL,
    "objectKey" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "CvUpload_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "CvVersion" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "cvUploadId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvChange" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "cvVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "material" BOOLEAN NOT NULL,
    "previousFieldId" TEXT,
    "previousValue" TEXT,
    "proposedFieldId" TEXT,
    "proposedValue" TEXT,
    "proposedExcerpt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "supplyingCompany" TEXT,
    "role" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "assignmentRef" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorProfileDetails" (
    "contractorId" TEXT NOT NULL,
    "securityClearance" TEXT,
    "ir35Status" TEXT,
    "workPattern" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ContractorProfileDetails_pkey" PRIMARY KEY ("contractorId")
);

-- CreateTable
CREATE TABLE "ReminderConfigVersion" (
    "version" SERIAL NOT NULL,
    "config" JSONB NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderConfigVersion_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "ScheduledReminder" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    "configVersion" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ScheduledReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "kind" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "reminderId" TEXT,
    "campaignId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "detail" JSONB,
    "providerEventId" TEXT,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "emailHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("emailHash")
);

-- CreateTable
CREATE TABLE "ConfirmLink" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "reminderId" TEXT,
    "action" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoopMessage" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentBy" TEXT,
    "readAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoopMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "target" TEXT,
    "readAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualCallTask" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualCallTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totpSecretEnc" TEXT,
    "totpEnrolledAt" TIMESTAMPTZ,
    "lastTotpStep" INTEGER,
    "lastSignInAt" TIMESTAMPTZ,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffOtp" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ,
    "requestIp" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "mfaVerifiedAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "lastUsedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT[],
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT[],
    "status" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL,
    "thresholdAtSubmit" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMPTZ,
    "decisionNote" TEXT,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "skipReason" TEXT,
    "messageId" TEXT,
    "processedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailOtp_emailHash_createdAt_idx" ON "EmailOtp"("emailHash", "createdAt");

-- CreateIndex
CREATE INDEX "EmailOtp_requestIp_createdAt_idx" ON "EmailOtp"("requestIp", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_contractorId_idx" ON "Session"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_phone_key" ON "Contractor"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_email_key" ON "Contractor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_referralCode_key" ON "Contractor"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_foundingPlace_key" ON "Contractor"("foundingPlace");

-- CreateIndex
CREATE INDEX "ConfirmationEvent_contractorId_confirmedAt_idx" ON "ConfirmationEvent"("contractorId", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_deviceHash_idx" ON "Referral"("referrerId", "deviceHash");

-- CreateIndex
CREATE INDEX "ReferralFlag_status_idx" ON "ReferralFlag"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralFlag_referralId_reason_key" ON "ReferralFlag"("referralId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionRun_cvUploadId_key" ON "ExtractionRun"("cvUploadId");

-- CreateIndex
CREATE INDEX "ExtractionRun_contractorId_idx" ON "ExtractionRun"("contractorId");

-- CreateIndex
CREATE INDEX "ConfirmedProfileField_contractorId_idx" ON "ConfirmedProfileField"("contractorId");

-- CreateIndex
CREATE INDEX "ConfirmedProfileField_draftId_idx" ON "ConfirmedProfileField"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmedProfileField_extractionRunId_fieldId_key" ON "ConfirmedProfileField"("extractionRunId", "fieldId");

-- CreateIndex
CREATE INDEX "Reward_qualifyingContractorId_idx" ON "Reward"("qualifyingContractorId");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_type_beneficiaryId_qualifyingContractorId_key" ON "Reward"("type", "beneficiaryId", "qualifyingContractorId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- CreateIndex
CREATE INDEX "EligibilityDeclaration_contractorId_idx" ON "EligibilityDeclaration"("contractorId");

-- CreateIndex
CREATE INDEX "EligibilityDeclaration_draftId_idx" ON "EligibilityDeclaration"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadDraft_tokenHash_key" ON "UploadDraft"("tokenHash");

-- CreateIndex
CREATE INDEX "UploadDraft_expiresAt_idx" ON "UploadDraft"("expiresAt");

-- CreateIndex
CREATE INDEX "UploadDraft_ipHash_createdAt_idx" ON "UploadDraft"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "CvUpload_contractorId_idx" ON "CvUpload"("contractorId");

-- CreateIndex
CREATE INDEX "CvUpload_draftId_idx" ON "CvUpload"("draftId");

-- CreateIndex
CREATE INDEX "CvUpload_status_createdAt_idx" ON "CvUpload"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CvUpload_ipHash_createdAt_idx" ON "CvUpload"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_contractorId_purpose_grantedAt_idx" ON "ConsentRecord"("contractorId", "purpose", "grantedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CvVersion_cvUploadId_key" ON "CvVersion"("cvUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "CvVersion_contractorId_versionNumber_key" ON "CvVersion"("contractorId", "versionNumber");

-- CreateIndex
CREATE INDEX "CvChange_contractorId_status_idx" ON "CvChange"("contractorId", "status");

-- CreateIndex
CREATE INDEX "CvChange_cvVersionId_idx" ON "CvChange"("cvVersionId");

-- CreateIndex
CREATE INDEX "Assignment_contractorId_startDate_idx" ON "Assignment"("contractorId", "startDate");

-- CreateIndex
CREATE INDEX "ScheduledReminder_status_dueAt_idx" ON "ScheduledReminder"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledReminder_contractorId_dedupeKey_key" ON "ScheduledReminder"("contractorId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Message_reminderId_key" ON "Message"("reminderId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");

-- CreateIndex
CREATE INDEX "Message_contractorId_createdAt_idx" ON "Message"("contractorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_campaignId_contractorId_key" ON "Message"("campaignId", "contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryLog_providerEventId_key" ON "DeliveryLog"("providerEventId");

-- CreateIndex
CREATE INDEX "DeliveryLog_messageId_occurredAt_idx" ON "DeliveryLog"("messageId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmLink_tokenHash_key" ON "ConfirmLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ConfirmLink_contractorId_idx" ON "ConfirmLink"("contractorId");

-- CreateIndex
CREATE INDEX "LoopMessage_contractorId_createdAt_idx" ON "LoopMessage"("contractorId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_contractorId_createdAt_idx" ON "Notification"("contractorId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualCallTask_contractorId_status_idx" ON "ManualCallTask"("contractorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE INDEX "StaffOtp_emailHash_createdAt_idx" ON "StaffOtp"("emailHash", "createdAt");

-- CreateIndex
CREATE INDEX "StaffOtp_requestIp_createdAt_idx" ON "StaffOtp"("requestIp", "createdAt");

-- CreateIndex
CREATE INDEX "StaffSession_staffId_idx" ON "StaffSession"("staffId");

-- CreateIndex
CREATE INDEX "TemplateVersion_kind_idx" ON "TemplateVersion"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_key_version_key" ON "TemplateVersion"("key", "version");

-- CreateIndex
CREATE INDEX "Campaign_status_createdAt_idx" ON "Campaign"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_contractorId_idx" ON "CampaignRecipient"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_contractorId_key" ON "CampaignRecipient"("campaignId", "contractorId");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_qualifyingContractorId_fkey" FOREIGN KEY ("qualifyingContractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---- Constraints Prisma cannot express ----------------------------------------------------------------------------

-- Nobody can introduce themselves (also enforced in the domain rule).
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_no_self_referral" CHECK ("referrerId" <> "refereeId");

-- At most one active (not withdrawn) grant per contractor and purpose, so parallel requests cannot double-grant.
CREATE UNIQUE INDEX "ConsentRecord_one_active_per_purpose" ON "ConsentRecord"("contractorId", "purpose") WHERE "withdrawnAt" IS NULL;

-- One open call task per contractor, so a repeated sweep cannot queue a second.
CREATE UNIQUE INDEX "ManualCallTask_one_open_per_contractor" ON "ManualCallTask"("contractorId") WHERE "status" = 'OPEN';

-- Audit log is append-only. The only permitted change is the privacy erasure scrub: nulling before/after, and only
-- inside a transaction that set loop.audit_scrub (see apps/api/src/modules/privacy/erasure.ts).
CREATE FUNCTION "audit_event_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AuditEvent is append-only';
  END IF;
  IF current_setting('loop.audit_scrub', true) = 'on'
     AND NEW."before" IS NULL AND NEW."after" IS NULL
     AND NEW."id" = OLD."id"
     AND NEW."actorId" IS NOT DISTINCT FROM OLD."actorId"
     AND NEW."actorType" = OLD."actorType"
     AND NEW."entityType" = OLD."entityType"
     AND NEW."entityId" = OLD."entityId"
     AND NEW."action" = OLD."action"
     AND NEW."createdAt" = OLD."createdAt" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION "audit_event_guard"();
