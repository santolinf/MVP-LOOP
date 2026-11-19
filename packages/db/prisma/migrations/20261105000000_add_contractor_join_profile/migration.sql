-- CreateTable
CREATE TABLE "ContractorJoinProfile" (
    "contractorId" TEXT NOT NULL,
    "preferredRoles" TEXT[],
    "additionalRoles" TEXT,
    "linkedinUrl" TEXT,
    "location" TEXT,
    "locationConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "noticePeriodText" TEXT,
    "earliestStartDate" DATE,
    "targetDayRatePence" INTEGER,
    "minDayRatePence" INTEGER,
    "usesUmbrella" BOOLEAN,
    "umbrellaProvider" TEXT,
    "workLocations" TEXT[],
    "otherLocations" TEXT,
    "londonAreas" TEXT[],
    "londonOther" TEXT,
    "workLocationsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "remoteUk" BOOLEAN,
    "workPatterns" TEXT[],
    "hybridDays" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ContractorJoinProfile_pkey" PRIMARY KEY ("contractorId")
);
