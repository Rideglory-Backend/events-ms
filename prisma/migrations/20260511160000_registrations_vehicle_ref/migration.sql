-- AlterTable
ALTER TABLE "EventRegistration" DROP COLUMN "licensePlate",
DROP COLUMN "vehicleBrand",
DROP COLUMN "vehicleReference",
DROP COLUMN "vin",
ADD COLUMN     "vehicleId" TEXT;
