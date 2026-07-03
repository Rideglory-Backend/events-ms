-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN     "medicalConsentAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "medicalConsentVersion" TEXT;
