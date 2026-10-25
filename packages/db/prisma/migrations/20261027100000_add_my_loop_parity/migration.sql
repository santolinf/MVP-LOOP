-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN "erasureRequestedAt" TIMESTAMPTZ,
ADD COLUMN "erasedAt" TIMESTAMPTZ;

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
