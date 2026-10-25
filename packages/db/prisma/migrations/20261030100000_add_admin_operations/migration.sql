-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "verificationRecordedBy" TEXT;

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "actorType" TEXT NOT NULL DEFAULT 'CONTRACTOR';

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

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
