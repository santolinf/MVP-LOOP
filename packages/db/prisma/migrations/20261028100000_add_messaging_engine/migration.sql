-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN     "unconfirmedSince" TIMESTAMPTZ,
ADD COLUMN     "escalationStage" TEXT;

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

-- CreateIndex
CREATE INDEX "ScheduledReminder_status_dueAt_idx" ON "ScheduledReminder"("status", "dueAt");
CREATE UNIQUE INDEX "ScheduledReminder_contractorId_dedupeKey_key" ON "ScheduledReminder"("contractorId", "dedupeKey");
CREATE UNIQUE INDEX "Message_reminderId_key" ON "Message"("reminderId");
CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");
CREATE INDEX "Message_contractorId_createdAt_idx" ON "Message"("contractorId", "createdAt");
CREATE UNIQUE INDEX "DeliveryLog_providerEventId_key" ON "DeliveryLog"("providerEventId");
CREATE INDEX "DeliveryLog_messageId_occurredAt_idx" ON "DeliveryLog"("messageId", "occurredAt");
CREATE UNIQUE INDEX "ConfirmLink_tokenHash_key" ON "ConfirmLink"("tokenHash");
CREATE INDEX "ConfirmLink_contractorId_idx" ON "ConfirmLink"("contractorId");
CREATE INDEX "LoopMessage_contractorId_createdAt_idx" ON "LoopMessage"("contractorId", "createdAt");
CREATE INDEX "Notification_contractorId_createdAt_idx" ON "Notification"("contractorId", "createdAt");
CREATE INDEX "ManualCallTask_contractorId_status_idx" ON "ManualCallTask"("contractorId", "status");

-- One open call task per contractor, so a repeated sweep cannot queue a second.
CREATE UNIQUE INDEX "ManualCallTask_one_open_per_contractor" ON "ManualCallTask"("contractorId") WHERE "status" = 'OPEN';
