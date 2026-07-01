-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "organizerAcceptedResponsibilityAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN     "shareMedicalInfo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowOrganizerContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riskAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "riskAcceptanceVersion" TEXT;
