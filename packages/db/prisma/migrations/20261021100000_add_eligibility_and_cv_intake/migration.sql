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

-- CreateIndex
CREATE INDEX "EligibilityDeclaration_contractorId_idx" ON "EligibilityDeclaration"("contractorId");
CREATE INDEX "EligibilityDeclaration_draftId_idx" ON "EligibilityDeclaration"("draftId");
CREATE UNIQUE INDEX "UploadDraft_tokenHash_key" ON "UploadDraft"("tokenHash");
CREATE INDEX "UploadDraft_expiresAt_idx" ON "UploadDraft"("expiresAt");
CREATE INDEX "UploadDraft_ipHash_createdAt_idx" ON "UploadDraft"("ipHash", "createdAt");
CREATE INDEX "CvUpload_contractorId_idx" ON "CvUpload"("contractorId");
CREATE INDEX "CvUpload_draftId_idx" ON "CvUpload"("draftId");
CREATE INDEX "CvUpload_status_createdAt_idx" ON "CvUpload"("status", "createdAt");
CREATE INDEX "CvUpload_ipHash_createdAt_idx" ON "CvUpload"("ipHash", "createdAt");
