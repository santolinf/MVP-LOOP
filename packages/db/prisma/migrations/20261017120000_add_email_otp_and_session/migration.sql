-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'SIGN_IN');
CREATE TYPE "ClientType" AS ENUM ('WEB', 'MOBILE_APP');
CREATE TYPE "AppPlatform" AS ENUM ('IOS', 'ANDROID');

-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN "firstAppSignInAt" TIMESTAMPTZ,
ADD COLUMN "firstAppSignInSessionId" TEXT;

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

-- CreateIndex
CREATE INDEX "EmailOtp_emailHash_createdAt_idx" ON "EmailOtp"("emailHash", "createdAt");
CREATE INDEX "EmailOtp_requestIp_createdAt_idx" ON "EmailOtp"("requestIp", "createdAt");
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
CREATE INDEX "Session_contractorId_idx" ON "Session"("contractorId");
