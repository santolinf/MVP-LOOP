-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN     "underlyingStatus" TEXT,
ADD COLUMN     "freshnessState" TEXT,
ADD COLUMN     "confirmationChannel" TEXT;

-- CreateTable
CREATE TABLE "ReminderConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ReminderConfig_pkey" PRIMARY KEY ("key")
);
